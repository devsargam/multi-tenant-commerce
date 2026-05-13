import type {
  CommerceProjectSpec,
  ProjectStatus,
  ProvisionedProject,
} from "@repo/deployment-types";

const projects = new Map<string, ProvisionedProject>();

const now = () => new Date().toISOString();

export const initialStatus = (message?: string): ProjectStatus => ({
  phase: "draft",
  namespaceReady: false,
  workloads: [],
  message,
});

export const listProjects = () =>
  [...projects.values()].sort((a, b) => a.spec.name.localeCompare(b.spec.name));

export const getProject = (id: string) => projects.get(id) ?? null;

export const hasProject = (id: string) => projects.has(id);

export const saveProject = (
  spec: CommerceProjectSpec,
  status?: ProjectStatus,
) => {
  const existing = projects.get(spec.id);
  const timestamp = now();
  const project: ProvisionedProject = {
    spec,
    status: status ?? existing?.status ?? initialStatus(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  projects.set(spec.id, project);
  return project;
};

export const updateProjectStatus = (id: string, status: ProjectStatus) => {
  const existing = projects.get(id);

  if (!existing) {
    return null;
  }

  const project: ProvisionedProject = {
    ...existing,
    status,
    updatedAt: now(),
  };

  projects.set(id, project);
  return project;
};

export const deleteProject = (id: string) => {
  const existing = projects.get(id);
  projects.delete(id);
  return existing ?? null;
};
