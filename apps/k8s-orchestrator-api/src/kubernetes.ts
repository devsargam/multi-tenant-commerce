import fs from "node:fs";

import * as k8s from "@kubernetes/client-node";
import type {
  CommerceProjectSpec,
  CommerceWorkload,
  ProjectLogLine,
  ProjectStatus,
  WorkloadRuntimeStatus,
} from "@repo/deployment-types";

import { generateManifests } from "./manifests.js";

const COMMERCE_WORKLOADS = [
  "api",
  "web",
  "admin-web",
] as const satisfies readonly CommerceWorkload[];

const DEFAULT_KUBECONFIG = "/Users/sargampoudel/.kube/config";
const FIELD_MANAGER = "scalable-commerce-orchestrator";

type ApplyMode = "dry-run" | "live";

const applyMode = (): ApplyMode =>
  process.env.K8S_APPLY_MODE === "live" ? "live" : "dry-run";

const selectorForProject = (project: CommerceProjectSpec) =>
  `app.kubernetes.io/name=scalable-commerce,app.kubernetes.io/instance=${project.slug}`;

const phaseForReadiness = (
  ready: number,
  desired: number,
): WorkloadRuntimeStatus["phase"] => {
  if (desired === 0) {
    return "unknown";
  }

  return ready >= desired ? "ready" : ready > 0 ? "progressing" : "pending";
};

const isNotFound = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const detail = error as Error & {
    statusCode?: number;
    body?: { code?: number };
    response?: { statusCode?: number; status?: number };
  };

  return (
    detail.statusCode === 404 ||
    detail.body?.code === 404 ||
    detail.response?.statusCode === 404 ||
    detail.response?.status === 404 ||
    error.message.includes("404")
  );
};

const workloadNameFromLabels = (
  labels: Record<string, string | undefined> | undefined,
) => labels?.["app.kubernetes.io/component"];

export class KubernetesOrchestrator {
  readonly mode: ApplyMode;
  readonly kubeconfigPath: string;

  private readonly objectApi?: k8s.KubernetesObjectApi;
  private readonly coreApi?: k8s.CoreV1Api;
  private readonly appsApi?: k8s.AppsV1Api;
  private readonly batchApi?: k8s.BatchV1Api;

  constructor() {
    this.mode = applyMode();
    this.kubeconfigPath = process.env.KUBECONFIG ?? DEFAULT_KUBECONFIG;

    if (this.mode !== "live") {
      return;
    }

    const kubeConfig = new k8s.KubeConfig();

    if (fs.existsSync(this.kubeconfigPath)) {
      kubeConfig.loadFromFile(this.kubeconfigPath);
    } else {
      kubeConfig.loadFromDefault();
    }

    this.objectApi = k8s.KubernetesObjectApi.makeApiClient(kubeConfig);
    this.coreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = kubeConfig.makeApiClient(k8s.AppsV1Api);
    this.batchApi = kubeConfig.makeApiClient(k8s.BatchV1Api);
  }

  connectionInfo() {
    return {
      mode: this.mode,
      kubeconfigPath: this.mode === "live" ? this.kubeconfigPath : undefined,
    };
  }

  manifests(project: CommerceProjectSpec) {
    return generateManifests(project);
  }

  async applyProject(project: CommerceProjectSpec): Promise<ProjectStatus> {
    const manifests = generateManifests(project);
    const appliedAt = new Date().toISOString();

    if (this.mode !== "live") {
      return {
        phase: "dry-run",
        namespaceReady: false,
        workloads: this.dryRunWorkloads(project),
        lastAppliedAt: appliedAt,
        message: `Generated ${manifests.length} Kubernetes manifests. Set K8S_APPLY_MODE=live to apply them.`,
      };
    }

    if (!this.objectApi) {
      throw new Error("Kubernetes object API is not initialized.");
    }

    for (const manifest of manifests) {
      await this.objectApi.patch(
        manifest as k8s.KubernetesObject,
        undefined,
        undefined,
        FIELD_MANAGER,
        true,
        k8s.PatchStrategy.ServerSideApply,
      );
    }

    const status = await this.status(project);

    return {
      ...status,
      lastAppliedAt: appliedAt,
      message: `Applied ${manifests.length} Kubernetes manifests.`,
    };
  }

  async deleteProject(project: CommerceProjectSpec): Promise<ProjectStatus> {
    if (this.mode === "live" && this.objectApi) {
      const manifests = [...generateManifests(project)].reverse();

      for (const manifest of manifests) {
        try {
          await this.objectApi.delete(manifest as k8s.KubernetesObject);
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
      }
    }

    return {
      phase: "deleted",
      namespaceReady: false,
      workloads: [],
      lastAppliedAt: new Date().toISOString(),
      message:
        this.mode === "live"
          ? "Kubernetes resources were deleted."
          : "Dry-run project was deleted from orchestrator memory.",
    };
  }

  async status(project: CommerceProjectSpec): Promise<ProjectStatus> {
    if (this.mode !== "live") {
      return {
        phase: "dry-run",
        namespaceReady: false,
        workloads: this.dryRunWorkloads(project),
        message: "Dry-run mode: manifests are generated but not applied.",
      };
    }

    if (!this.appsApi || !this.batchApi) {
      throw new Error("Kubernetes API clients are not initialized.");
    }

    const labelSelector = selectorForProject(project);
    const deployments = await this.appsApi.listNamespacedDeployment({
      namespace: project.namespace,
      labelSelector,
    });
    const jobs = await this.batchApi.listNamespacedJob({
      namespace: project.namespace,
      labelSelector,
    });

    const workloadStatuses = deployments.items.map((deployment) => {
      const labels = deployment.metadata?.labels ?? {};
      const component = workloadNameFromLabels(labels) as CommerceWorkload;
      const desired = deployment.spec?.replicas ?? 0;
      const ready = deployment.status?.readyReplicas ?? 0;

      return {
        name: component,
        kind: "Deployment" as const,
        ready,
        desired,
        phase: phaseForReadiness(ready, desired),
        message: deployment.status?.conditions?.at(-1)?.message,
      };
    });

    const migrationStatuses = jobs.items.map((job) => {
      const succeeded = job.status?.succeeded ?? 0;
      const failed = job.status?.failed ?? 0;
      const desired = 1;

      return {
        name: "migration" as const,
        kind: "Job" as const,
        ready: succeeded,
        desired,
        phase:
          succeeded >= desired
            ? ("ready" as const)
            : failed > 0
              ? ("failed" as const)
              : ("pending" as const),
        message: job.status?.conditions?.at(-1)?.message,
      };
    });

    const allStatuses: WorkloadRuntimeStatus[] = [
      ...workloadStatuses,
      ...migrationStatuses,
    ];
    const failed = allStatuses.some((item) => item.phase === "failed");
    const ready =
      allStatuses.length > 0 &&
      allStatuses.every((item) => item.phase === "ready");

    return {
      phase: failed ? "failed" : ready ? "ready" : "applying",
      namespaceReady: true,
      workloads: allStatuses,
    };
  }

  async pods(project: CommerceProjectSpec) {
    if (this.mode !== "live" || !this.coreApi) {
      return [];
    }

    const pods = await this.coreApi.listNamespacedPod({
      namespace: project.namespace,
      labelSelector: selectorForProject(project),
    });

    return pods.items.map((pod) => ({
      name: pod.metadata?.name ?? "unknown",
      component: workloadNameFromLabels(pod.metadata?.labels),
      phase: pod.status?.phase ?? "Unknown",
      nodeName: pod.spec?.nodeName,
      containers:
        pod.status?.containerStatuses?.map((container) => ({
          name: container.name,
          ready: container.ready,
          restartCount: container.restartCount,
          image: container.image,
        })) ?? [],
    }));
  }

  async logs(
    project: CommerceProjectSpec,
    workload: CommerceWorkload,
    tailLines: number,
  ): Promise<ProjectLogLine[]> {
    if (this.mode !== "live" || !this.coreApi) {
      return [
        {
          pod: "dry-run",
          container: workload,
          line: "Dry-run mode: no Kubernetes pod logs are available.",
        },
      ];
    }

    const pods = await this.coreApi.listNamespacedPod({
      namespace: project.namespace,
      labelSelector: `${selectorForProject(project)},app.kubernetes.io/component=${workload}`,
    });
    const pod = pods.items[0];
    const podName = pod?.metadata?.name;

    if (!podName) {
      return [];
    }

    let raw = "";

    try {
      raw = await this.coreApi.readNamespacedPodLog({
        name: podName,
        namespace: project.namespace,
        container: workload,
        follow: false,
        previous: false,
        tailLines,
        timestamps: true,
      });
    } catch (error) {
      const message = this.kubernetesErrorMessage(error);

      return [
        {
          pod: podName,
          container: workload,
          line: message
            ? `Kubernetes cannot stream logs yet: ${message}`
            : "Kubernetes cannot stream logs until the container starts.",
        },
      ];
    }

    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [timestamp, ...rest] = line.split(" ");
        return {
          pod: podName,
          container: workload,
          timestamp,
          line: rest.join(" ") || line,
        };
      });
  }

  private kubernetesErrorMessage(error: unknown) {
    const detail = error as { body?: unknown; message?: string };

    if (typeof detail.body === "string") {
      try {
        const status = JSON.parse(detail.body) as { message?: string };
        return status.message ?? detail.message;
      } catch {
        return detail.body;
      }
    }

    return detail.message;
  }

  private dryRunWorkloads(
    project: CommerceProjectSpec,
  ): WorkloadRuntimeStatus[] {
    return [
      ...COMMERCE_WORKLOADS.map((name) => ({
        name,
        kind: "Deployment" as const,
        ready: 0,
        desired: project.replicas[name],
        phase: "pending" as const,
        message: "Dry-run mode",
      })),
      {
        name: "migration" as const,
        kind: "Job" as const,
        ready: 0,
        desired: 1,
        phase: "pending" as const,
        message: "Dry-run mode",
      },
    ];
  }
}
