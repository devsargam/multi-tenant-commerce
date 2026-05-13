import { spawn, type ChildProcessByStdio } from "node:child_process";
import net from "node:net";
import type { Readable } from "node:stream";

import {
  COMMERCE_WORKLOADS,
  type CommerceProjectSpec,
  type CommerceWorkload,
  type LocalAccessState,
  type LocalAccessStatus,
  type LocalAccessTarget,
} from "@repo/deployment-types";

const WORKLOAD_PORTS: Record<CommerceWorkload, number> = {
  api: 3001,
  web: 3000,
  "admin-web": 3002,
};

const WORKLOAD_PORT_OFFSETS: Record<CommerceWorkload, number> = {
  web: 0,
  api: 1,
  "admin-web": 2,
};

type KubernetesConnectionInfo = {
  mode: "dry-run" | "live";
  kubeconfigPath?: string;
};

type LocalAccessSession = {
  target: LocalAccessTarget;
  child?: ChildProcessByStdio<null, Readable, Readable>;
  stopRequested: boolean;
};

const hashString = (value: string) => {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
};

const lastMessage = (value: Buffer | string) => {
  const lines = value
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.at(-1);
};

const isPortAvailable = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });

export class LocalAccessManager {
  private readonly sessions = new Map<string, LocalAccessSession>();

  private readonly preferredPorts = new Map<string, number>();

  private readonly basePort = Number(
    process.env.LOCAL_ACCESS_PORT_BASE ?? 3100,
  );

  private readonly kubectl = process.env.KUBECTL_BINARY ?? "kubectl";

  private readonly bindAddress =
    process.env.LOCAL_ACCESS_BIND_ADDRESS ?? "127.0.0.1";

  constructor(private readonly connection: KubernetesConnectionInfo) {}

  status(project: CommerceProjectSpec): LocalAccessState {
    return {
      projectId: project.id,
      namespace: project.namespace,
      services: COMMERCE_WORKLOADS.map((workload) =>
        this.targetFor(project, workload),
      ),
    };
  }

  async start(
    project: CommerceProjectSpec,
    workloads: readonly CommerceWorkload[] = COMMERCE_WORKLOADS,
  ) {
    this.assertLive();

    for (const workload of workloads) {
      await this.startOne(project, workload);
    }

    return this.status(project);
  }

  stop(
    project: CommerceProjectSpec,
    workloads: readonly CommerceWorkload[] = COMMERCE_WORKLOADS,
  ) {
    for (const workload of workloads) {
      const session = this.sessions.get(this.key(project, workload));

      if (!session) {
        continue;
      }

      session.stopRequested = true;
      session.target.status = "stopped";
      session.target.message = "Port forward stopped.";

      if (session.child && !session.child.killed) {
        session.child.kill("SIGTERM");
      }
    }

    return this.status(project);
  }

  stopProject(project: CommerceProjectSpec) {
    return this.stop(project);
  }

  stopAll() {
    for (const session of this.sessions.values()) {
      session.stopRequested = true;
      session.target.status = "stopped";

      if (session.child && !session.child.killed) {
        session.child.kill("SIGTERM");
      }
    }
  }

  private assertLive() {
    if (this.connection.mode !== "live" || !this.connection.kubeconfigPath) {
      throw new Error(
        "Local access requires K8S_APPLY_MODE=live and a loaded kubeconfig.",
      );
    }
  }

  private async startOne(
    project: CommerceProjectSpec,
    workload: CommerceWorkload,
  ) {
    const key = this.key(project, workload);
    const current = this.sessions.get(key);

    if (
      current?.child &&
      !current.child.killed &&
      ["running", "starting"].includes(current.target.status)
    ) {
      return;
    }

    const localPort = await this.allocatePort(project, workload);
    const target = this.makeTarget(project, workload, localPort, "starting");
    const args = [
      "--kubeconfig",
      this.connection.kubeconfigPath ?? "",
      "-n",
      project.namespace,
      "port-forward",
      "--address",
      this.bindAddress,
      `svc/${target.serviceName}`,
      `${target.localPort}:${target.targetPort}`,
    ];
    const child = spawn(this.kubectl, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const session: LocalAccessSession = {
      target: {
        ...target,
        pid: child.pid,
        message: "Starting kubectl port-forward.",
      },
      child,
      stopRequested: false,
    };

    this.sessions.set(key, session);

    child.stdout.on("data", (chunk: Buffer) => {
      const message = lastMessage(chunk);

      if (!message) {
        return;
      }

      session.target.message = message;

      if (message.includes("Forwarding from")) {
        session.target.status = "running";
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const message = lastMessage(chunk);

      if (!message) {
        return;
      }

      session.target.message = message;

      if (message.toLowerCase().includes("error")) {
        session.target.status = "error";
      }
    });

    child.once("error", (error) => {
      session.target.status = "error";
      session.target.message = error.message;
      session.target.pid = undefined;
    });

    child.once("exit", (code, signal) => {
      const latest = this.sessions.get(key);

      if (latest !== session) {
        return;
      }

      session.child = undefined;
      session.target.pid = undefined;
      session.target.status = session.stopRequested ? "stopped" : "error";
      session.target.message = session.stopRequested
        ? "Port forward stopped."
        : `kubectl port-forward exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}.`;
    });

    await this.waitForStart(session);
  }

  private targetFor(project: CommerceProjectSpec, workload: CommerceWorkload) {
    const session = this.sessions.get(this.key(project, workload));

    if (session) {
      return session.target;
    }

    const localPort =
      this.preferredPorts.get(this.key(project, workload)) ??
      this.preferredPort(project, workload);

    return this.makeTarget(project, workload, localPort, "stopped");
  }

  private makeTarget(
    project: CommerceProjectSpec,
    workload: CommerceWorkload,
    localPort: number,
    status: LocalAccessStatus,
  ): LocalAccessTarget {
    return {
      workload,
      namespace: project.namespace,
      serviceName: `${project.slug}-${workload}`,
      targetPort: WORKLOAD_PORTS[workload],
      localPort,
      url: `http://localhost:${localPort}`,
      status,
    };
  }

  private async allocatePort(
    project: CommerceProjectSpec,
    workload: CommerceWorkload,
  ) {
    const key = this.key(project, workload);
    const startingPort =
      this.preferredPorts.get(key) ?? this.preferredPort(project, workload);
    const usedPorts = new Set(
      [...this.sessions.values()]
        .filter(
          (session) =>
            session.child &&
            !session.child.killed &&
            session.target.status !== "stopped",
        )
        .map((session) => session.target.localPort),
    );

    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const candidate = startingPort + attempt * 10;

      if (candidate > 65_535 || usedPorts.has(candidate)) {
        continue;
      }

      if (await isPortAvailable(candidate)) {
        this.preferredPorts.set(key, candidate);
        return candidate;
      }
    }

    throw new Error(`No available localhost port found for ${workload}.`);
  }

  private preferredPort(
    project: CommerceProjectSpec,
    workload: CommerceWorkload,
  ) {
    const bucket = hashString(project.slug) % 500;
    return this.basePort + bucket * 10 + WORKLOAD_PORT_OFFSETS[workload];
  }

  private key(project: CommerceProjectSpec, workload: CommerceWorkload) {
    return `${project.id}:${workload}`;
  }

  private waitForStart(session: LocalAccessSession) {
    return new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const interval = setInterval(() => {
        if (
          session.target.status !== "starting" ||
          Date.now() - startedAt > 1500
        ) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
  }
}
