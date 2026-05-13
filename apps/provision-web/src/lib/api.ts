import type {
  CommerceWorkload,
  EnvPatchRequest,
  KubernetesManifest,
  LocalAccessActionRequest,
  LocalAccessState,
  ProjectCreateRequest,
  ProjectLogLine,
  ProjectStatus,
  ProjectUpdateRequest,
  ProvisionedProject,
} from "@repo/deployment-types";

const API_URL =
  import.meta.env.VITE_ORCHESTRATOR_API_URL ?? "http://localhost:3010";

type HealthResponse = {
  status: string;
  service: string;
  kubernetes: {
    mode: "dry-run" | "live";
    kubeconfigPath?: string;
  };
};

type PodSummary = {
  name: string;
  component?: string;
  phase: string;
  nodeName?: string;
  containers: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    image: string;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error ?? message;
    } catch {
      message = await response.text();
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  listProjects: () => request<ProvisionedProject[]>("/projects"),
  createProject: (input: ProjectCreateRequest) =>
    request<ProvisionedProject>("/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProject: (id: string, input: ProjectUpdateRequest) =>
    request<ProvisionedProject>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  patchEnv: (id: string, input: EnvPatchRequest) =>
    request<ProvisionedProject>(`/projects/${id}/env`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  applyProject: (id: string) =>
    request<ProvisionedProject>(`/projects/${id}/apply`, { method: "POST" }),
  redeployProject: (id: string) =>
    request<ProvisionedProject>(`/projects/${id}/redeploy`, { method: "POST" }),
  deleteProject: (id: string) =>
    request<ProvisionedProject>(`/projects/${id}`, { method: "DELETE" }),
  getStatus: (id: string) => request<ProjectStatus>(`/projects/${id}/status`),
  getManifests: (id: string) =>
    request<KubernetesManifest[]>(`/projects/${id}/manifests`),
  getPods: (id: string) => request<PodSummary[]>(`/projects/${id}/pods`),
  getLogs: (id: string, workload: CommerceWorkload) =>
    request<ProjectLogLine[]>(`/projects/${id}/logs?workload=${workload}`),
  getLocalAccess: (id: string) =>
    request<LocalAccessState>(`/projects/${id}/local-access`),
  startLocalAccess: (id: string, input: LocalAccessActionRequest = {}) =>
    request<LocalAccessState>(`/projects/${id}/local-access/start`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  stopLocalAccess: (id: string, input: LocalAccessActionRequest = {}) =>
    request<LocalAccessState>(`/projects/${id}/local-access/stop`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
