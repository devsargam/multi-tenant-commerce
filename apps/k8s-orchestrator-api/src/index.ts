import "dotenv/config";

import express from "express";
import type { Request, Response } from "express";
import type {
  CommerceWorkload,
  EnvPatchRequest,
  LocalAccessActionRequest,
  ProjectCreateRequest,
  ProjectStatus,
  ProjectUpdateRequest,
} from "@repo/deployment-types";

import { KubernetesOrchestrator } from "./kubernetes.js";
import { LocalAccessManager } from "./local-access.js";
import {
  createProjectSpec,
  patchProjectEnv,
  updateProjectSpec,
  ValidationError,
} from "./project.js";
import {
  deleteProject,
  getProject,
  hasProject,
  listProjects,
  saveProject,
  updateProjectStatus,
} from "./store.js";

const COMMERCE_WORKLOADS = [
  "api",
  "web",
  "admin-web",
] as const satisfies readonly CommerceWorkload[];

const app = express();
const port = Number(process.env.PORT ?? 3010);
const orchestrator = new KubernetesOrchestrator();
const localAccess = new LocalAccessManager(orchestrator.connectionInfo());

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const asyncRoute = (handler: AsyncHandler) => (req: Request, res: Response) => {
  handler(req, res).catch((error: unknown) => {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected API error",
    });
  });
};

const routeParam = (req: Request, key: string) => {
  const value = req.params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

const requireProject = (id: string, res: Response) => {
  const project = getProject(id);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }

  return project;
};

const applyingStatus = (message: string): ProjectStatus => ({
  phase: "applying",
  namespaceReady: false,
  workloads: [],
  message,
});

const workloadsFromBody = (req: Request, res: Response) => {
  const body = req.body as LocalAccessActionRequest | undefined;

  if (!body?.workloads) {
    return [...COMMERCE_WORKLOADS];
  }

  if (
    !Array.isArray(body.workloads) ||
    body.workloads.some(
      (workload) => !COMMERCE_WORKLOADS.includes(workload as CommerceWorkload),
    )
  ) {
    res.status(400).json({ error: "Invalid local access workload list" });
    return null;
  }

  return [...new Set(body.workloads)];
};

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "k8s-orchestrator-api",
    kubernetes: orchestrator.connectionInfo(),
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "k8s-orchestrator-api",
    message: "Scalable Commerce Kubernetes orchestrator is running",
    kubernetes: orchestrator.connectionInfo(),
    endpoints: [
      "GET /projects",
      "POST /projects",
      "PATCH /projects/:id",
      "PATCH /projects/:id/env",
      "POST /projects/:id/apply",
      "POST /projects/:id/redeploy",
      "GET /projects/:id/local-access",
      "POST /projects/:id/local-access/start",
      "POST /projects/:id/local-access/stop",
      "GET /projects/:id/manifests",
      "GET /projects/:id/pods",
      "GET /projects/:id/logs?workload=api",
    ],
  });
});

app.get("/projects", (_req, res) => {
  res.json(listProjects());
});

app.post(
  "/projects",
  asyncRoute(async (req, res) => {
    const spec = createProjectSpec(req.body as ProjectCreateRequest);

    if (hasProject(spec.id)) {
      res.status(409).json({ error: "Project slug already exists" });
      return;
    }

    saveProject(spec, applyingStatus("Applying initial project resources."));
    const status = await orchestrator.applyProject(spec);
    const project = saveProject(spec, status);

    res.status(201).json(project);
  }),
);

app.get("/projects/:id", (req, res) => {
  const project = requireProject(routeParam(req, "id"), res);

  if (!project) {
    return;
  }

  res.json(project);
});

app.put(
  "/projects/:id",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    const spec = updateProjectSpec(
      project.spec,
      req.body as ProjectUpdateRequest,
    );
    saveProject(spec, applyingStatus("Applying project changes."));
    const status = await orchestrator.applyProject(spec);

    res.json(saveProject(spec, status));
  }),
);

app.patch(
  "/projects/:id",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    const spec = updateProjectSpec(
      project.spec,
      req.body as ProjectUpdateRequest,
    );
    saveProject(spec, applyingStatus("Applying project changes."));
    const status = await orchestrator.applyProject(spec);

    res.json(saveProject(spec, status));
  }),
);

app.patch(
  "/projects/:id/env",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    const spec = patchProjectEnv(project.spec, req.body as EnvPatchRequest);
    saveProject(spec, applyingStatus("Applying environment changes."));
    const status = await orchestrator.applyProject(spec);

    res.json(saveProject(spec, status));
  }),
);

app.post(
  "/projects/:id/apply",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    saveProject(project.spec, applyingStatus("Re-applying project resources."));
    const status = await orchestrator.applyProject(project.spec);

    res.json(saveProject(project.spec, status));
  }),
);

app.post(
  "/projects/:id/redeploy",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    const spec = {
      ...project.spec,
      rolloutNonce: new Date().toISOString(),
    };
    saveProject(spec, applyingStatus("Forcing workload rollout."));
    const status = await orchestrator.applyProject(spec);

    res.json(saveProject(spec, status));
  }),
);

app.get("/projects/:id/manifests", (req, res) => {
  const project = requireProject(routeParam(req, "id"), res);

  if (!project) {
    return;
  }

  res.json(orchestrator.manifests(project.spec));
});

app.get("/projects/:id/local-access", (req, res) => {
  const project = requireProject(routeParam(req, "id"), res);

  if (!project) {
    return;
  }

  res.json(localAccess.status(project.spec));
});

app.post(
  "/projects/:id/local-access/start",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    if (orchestrator.connectionInfo().mode !== "live") {
      res.status(409).json({
        error: "Local access requires K8S_APPLY_MODE=live.",
      });
      return;
    }

    const workloads = workloadsFromBody(req, res);

    if (!workloads) {
      return;
    }

    res.json(await localAccess.start(project.spec, workloads));
  }),
);

app.post("/projects/:id/local-access/stop", (req, res) => {
  const project = requireProject(routeParam(req, "id"), res);

  if (!project) {
    return;
  }

  const workloads = workloadsFromBody(req, res);

  if (!workloads) {
    return;
  }

  res.json(localAccess.stop(project.spec, workloads));
});

app.get(
  "/projects/:id/status",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    const status = await orchestrator.status(project.spec);
    updateProjectStatus(project.spec.id, status);

    res.json(status);
  }),
);

app.get(
  "/projects/:id/pods",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    res.json(await orchestrator.pods(project.spec));
  }),
);

app.get(
  "/projects/:id/logs",
  asyncRoute(async (req, res) => {
    const project = requireProject(routeParam(req, "id"), res);

    if (!project) {
      return;
    }

    const workload =
      typeof req.query.workload === "string" ? req.query.workload : "api";
    const tailLines =
      typeof req.query.tail === "string" ? Number(req.query.tail) : 100;

    if (!COMMERCE_WORKLOADS.includes(workload as CommerceWorkload)) {
      res.status(400).json({ error: "Invalid workload" });
      return;
    }

    res.json(
      await orchestrator.logs(
        project.spec,
        workload as CommerceWorkload,
        Number.isFinite(tailLines) ? tailLines : 100,
      ),
    );
  }),
);

app.delete(
  "/projects/:id",
  asyncRoute(async (req, res) => {
    const id = routeParam(req, "id");
    const project = requireProject(id, res);

    if (!project) {
      return;
    }

    localAccess.stopProject(project.spec);
    const status = await orchestrator.deleteProject(project.spec);
    deleteProject(id);

    res.json({ ...project, status });
  }),
);

const server = app.listen(port, () => {
  console.log(
    `Kubernetes orchestrator API listening on http://localhost:${port}`,
  );
  console.log(`Kubernetes mode: ${orchestrator.connectionInfo().mode}`);
});

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  localAccess.stopAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
