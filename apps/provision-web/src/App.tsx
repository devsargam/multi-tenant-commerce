import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import {
  Activity,
  Boxes,
  Cable,
  ExternalLink,
  FileJson,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  Rocket,
  Save,
  Server,
  Shield,
  Square,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  COMMERCE_WORKLOADS,
  type CommerceWorkload,
  type KubernetesManifest,
  type LocalAccessState,
  type ProjectEnvVar,
  type ProjectLogLine,
  type ProjectStatus,
  type ProvisionedProject,
} from "@repo/deployment-types";

import { api } from "@/lib/api";

type Tab = "overview" | "config" | "env" | "runtime" | "local" | "manifests";

type ProjectDraft = {
  name: string;
  slug: string;
  apiImage: string;
  webImage: string;
  adminWebImage: string;
  apiReplicas: string;
  webReplicas: string;
  adminWebReplicas: string;
  apiCpuRequest: string;
  apiCpuLimit: string;
  apiMemoryRequestMi: string;
  apiMemoryLimitMi: string;
  webCpuRequest: string;
  webCpuLimit: string;
  webMemoryRequestMi: string;
  webMemoryLimitMi: string;
  adminWebCpuRequest: string;
  adminWebCpuLimit: string;
  adminWebMemoryRequestMi: string;
  adminWebMemoryLimitMi: string;
  postgresCpuRequest: string;
  postgresCpuLimit: string;
  postgresMemoryRequestMi: string;
  postgresMemoryLimitMi: string;
  postgresMode: "internal" | "external";
  databaseUrl: string;
  storageGi: string;
  ingressEnabled: boolean;
  ingressHost: string;
  ingressClassName: string;
  tlsSecretName: string;
};

type EnvDraft = ProjectEnvVar & {
  id: string;
};

const defaultDraft: ProjectDraft = {
  name: "",
  slug: "",
  apiImage: "ghcr.io/devsargam/multi-tenant-commerce-api:latest",
  webImage: "ghcr.io/devsargam/multi-tenant-commerce-web:latest",
  adminWebImage: "ghcr.io/devsargam/multi-tenant-commerce-admin-web:latest",
  apiReplicas: "1",
  webReplicas: "1",
  adminWebReplicas: "1",
  apiCpuRequest: "250m",
  apiCpuLimit: "750m",
  apiMemoryRequestMi: "256",
  apiMemoryLimitMi: "768",
  webCpuRequest: "200m",
  webCpuLimit: "500m",
  webMemoryRequestMi: "256",
  webMemoryLimitMi: "512",
  adminWebCpuRequest: "100m",
  adminWebCpuLimit: "300m",
  adminWebMemoryRequestMi: "128",
  adminWebMemoryLimitMi: "256",
  postgresCpuRequest: "250m",
  postgresCpuLimit: "1000m",
  postgresMemoryRequestMi: "512",
  postgresMemoryLimitMi: "1024",
  postgresMode: "internal",
  databaseUrl: "",
  storageGi: "5",
  ingressEnabled: false,
  ingressHost: "",
  ingressClassName: "",
  tlsSecretName: "",
};

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "config", label: "Config", icon: Server },
  { id: "env", label: "Env", icon: KeyRound },
  { id: "runtime", label: "Runtime", icon: Boxes },
  { id: "local", label: "Local", icon: Cable },
  { id: "manifests", label: "Manifests", icon: FileJson },
];

const phaseStyles: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  running: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  starting: "bg-blue-100 text-blue-800 ring-blue-200",
  applying: "bg-blue-100 text-blue-800 ring-blue-200",
  progressing: "bg-blue-100 text-blue-800 ring-blue-200",
  "dry-run": "bg-zinc-100 text-zinc-700 ring-zinc-200",
  stopped: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  failed: "bg-red-100 text-red-800 ring-red-200",
  deleted: "bg-zinc-200 text-zinc-700 ring-zinc-300",
  draft: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  unknown: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

const workloadLabels: Record<CommerceWorkload, string> = {
  api: "API",
  web: "Storefront",
  "admin-web": "Admin",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function numberFromDraft(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function phaseClass(phase: string) {
  return phaseStyles[phase] ?? phaseStyles.unknown;
}

function draftFromProject(project: ProvisionedProject): ProjectDraft {
  const resources = project.spec.resources ?? {
    api: {
      cpuRequest: defaultDraft.apiCpuRequest,
      cpuLimit: defaultDraft.apiCpuLimit,
      memoryRequestMi: Number(defaultDraft.apiMemoryRequestMi),
      memoryLimitMi: Number(defaultDraft.apiMemoryLimitMi),
    },
    web: {
      cpuRequest: defaultDraft.webCpuRequest,
      cpuLimit: defaultDraft.webCpuLimit,
      memoryRequestMi: Number(defaultDraft.webMemoryRequestMi),
      memoryLimitMi: Number(defaultDraft.webMemoryLimitMi),
    },
    "admin-web": {
      cpuRequest: defaultDraft.adminWebCpuRequest,
      cpuLimit: defaultDraft.adminWebCpuLimit,
      memoryRequestMi: Number(defaultDraft.adminWebMemoryRequestMi),
      memoryLimitMi: Number(defaultDraft.adminWebMemoryLimitMi),
    },
    postgres: {
      cpuRequest: defaultDraft.postgresCpuRequest,
      cpuLimit: defaultDraft.postgresCpuLimit,
      memoryRequestMi: Number(defaultDraft.postgresMemoryRequestMi),
      memoryLimitMi: Number(defaultDraft.postgresMemoryLimitMi),
    },
  };

  return {
    name: project.spec.name,
    slug: project.spec.slug,
    apiImage: project.spec.images.api,
    webImage: project.spec.images.web,
    adminWebImage: project.spec.images["admin-web"],
    apiReplicas: String(project.spec.replicas.api),
    webReplicas: String(project.spec.replicas.web),
    adminWebReplicas: String(project.spec.replicas["admin-web"]),
    apiCpuRequest: resources.api.cpuRequest,
    apiCpuLimit: resources.api.cpuLimit,
    apiMemoryRequestMi: String(resources.api.memoryRequestMi),
    apiMemoryLimitMi: String(resources.api.memoryLimitMi),
    webCpuRequest: resources.web.cpuRequest,
    webCpuLimit: resources.web.cpuLimit,
    webMemoryRequestMi: String(resources.web.memoryRequestMi),
    webMemoryLimitMi: String(resources.web.memoryLimitMi),
    adminWebCpuRequest: resources["admin-web"].cpuRequest,
    adminWebCpuLimit: resources["admin-web"].cpuLimit,
    adminWebMemoryRequestMi: String(resources["admin-web"].memoryRequestMi),
    adminWebMemoryLimitMi: String(resources["admin-web"].memoryLimitMi),
    postgresCpuRequest: resources.postgres.cpuRequest,
    postgresCpuLimit: resources.postgres.cpuLimit,
    postgresMemoryRequestMi: String(resources.postgres.memoryRequestMi),
    postgresMemoryLimitMi: String(resources.postgres.memoryLimitMi),
    postgresMode: project.spec.postgres.mode,
    databaseUrl: project.spec.postgres.databaseUrl ?? "",
    storageGi: String(project.spec.postgres.storageGi),
    ingressEnabled: project.spec.ingress.enabled,
    ingressHost: project.spec.ingress.host ?? "",
    ingressClassName: project.spec.ingress.className ?? "",
    tlsSecretName: project.spec.ingress.tlsSecretName ?? "",
  };
}

function requestFromDraft(draft: ProjectDraft) {
  return {
    name: draft.name,
    slug: draft.slug || undefined,
    images: {
      api: draft.apiImage,
      web: draft.webImage,
      "admin-web": draft.adminWebImage,
    },
    replicas: {
      api: numberFromDraft(draft.apiReplicas, 1),
      web: numberFromDraft(draft.webReplicas, 1),
      "admin-web": numberFromDraft(draft.adminWebReplicas, 1),
    },
    resources: {
      api: {
        cpuRequest: draft.apiCpuRequest,
        cpuLimit: draft.apiCpuLimit,
        memoryRequestMi: numberFromDraft(draft.apiMemoryRequestMi, 256),
        memoryLimitMi: numberFromDraft(draft.apiMemoryLimitMi, 768),
      },
      web: {
        cpuRequest: draft.webCpuRequest,
        cpuLimit: draft.webCpuLimit,
        memoryRequestMi: numberFromDraft(draft.webMemoryRequestMi, 256),
        memoryLimitMi: numberFromDraft(draft.webMemoryLimitMi, 512),
      },
      "admin-web": {
        cpuRequest: draft.adminWebCpuRequest,
        cpuLimit: draft.adminWebCpuLimit,
        memoryRequestMi: numberFromDraft(draft.adminWebMemoryRequestMi, 128),
        memoryLimitMi: numberFromDraft(draft.adminWebMemoryLimitMi, 256),
      },
      postgres: {
        cpuRequest: draft.postgresCpuRequest,
        cpuLimit: draft.postgresCpuLimit,
        memoryRequestMi: numberFromDraft(draft.postgresMemoryRequestMi, 512),
        memoryLimitMi: numberFromDraft(draft.postgresMemoryLimitMi, 1024),
      },
    },
    postgres: {
      mode: draft.postgresMode,
      databaseUrl:
        draft.postgresMode === "external" ? draft.databaseUrl : undefined,
      storageGi: numberFromDraft(draft.storageGi, 5),
    },
    ingress: {
      enabled: draft.ingressEnabled,
      host: draft.ingressHost || undefined,
      className: draft.ingressClassName || undefined,
      tlsSecretName: draft.tlsSecretName || undefined,
    },
  };
}

function envDraftsFromProject(project: ProvisionedProject): EnvDraft[] {
  return project.spec.env.map((env, index) => ({
    ...env,
    id: `${env.scope}-${env.key}-${index}`,
  }));
}

function Button({
  icon: Icon,
  children,
  variant = "primary",
  disabled,
  onClick,
  type = "button",
}: {
  icon?: LucideIcon;
  children: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const classes = {
    primary: "bg-zinc-950 text-white hover:bg-zinc-800",
    secondary: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
    ghost: "text-zinc-700 hover:bg-zinc-100",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        classes[variant],
      )}
    >
      {Icon ? <Icon aria-hidden="true" size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200",
        props.className,
      )}
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200",
        props.className,
      )}
    />
  );
}

function ResourceRow({
  label,
  cpuRequest,
  cpuLimit,
  memoryRequestMi,
  memoryLimitMi,
  onCpuRequest,
  onCpuLimit,
  onMemoryRequestMi,
  onMemoryLimitMi,
}: {
  label: string;
  cpuRequest: string;
  cpuLimit: string;
  memoryRequestMi: string;
  memoryLimitMi: string;
  onCpuRequest: (value: string) => void;
  onCpuLimit: (value: string) => void;
  onMemoryRequestMi: (value: string) => void;
  onMemoryLimitMi: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 p-4 xl:grid-cols-[120px_repeat(4,minmax(0,1fr))]">
      <div className="flex items-center text-sm font-semibold text-zinc-800">
        {label}
      </div>
      <Field label="CPU request">
        <TextInput
          value={cpuRequest}
          onChange={(event) => onCpuRequest(event.target.value)}
          placeholder="250m"
        />
      </Field>
      <Field label="CPU limit">
        <TextInput
          value={cpuLimit}
          onChange={(event) => onCpuLimit(event.target.value)}
          placeholder="750m"
        />
      </Field>
      <Field label="Memory request Mi">
        <TextInput
          type="number"
          min={64}
          value={memoryRequestMi}
          onChange={(event) => onMemoryRequestMi(event.target.value)}
        />
      </Field>
      <Field label="Memory limit Mi">
        <TextInput
          type="number"
          min={64}
          value={memoryLimitMi}
          onChange={(event) => onMemoryLimitMi(event.target.value)}
        />
      </Field>
    </div>
  );
}

function StatusPill({ phase }: { phase: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1",
        phaseClass(phase),
      )}
    >
      {phase}
    </span>
  );
}

export default function App() {
  const [projects, setProjects] = useState<ProvisionedProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydratedProjectId, setHydratedProjectId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isCreating, setIsCreating] = useState(true);
  const [draft, setDraft] = useState<ProjectDraft>(defaultDraft);
  const [envRows, setEnvRows] = useState<EnvDraft[]>([]);
  const [health, setHealth] = useState<string>("checking");
  const [kubeMode, setKubeMode] = useState<"dry-run" | "live">("dry-run");
  const [kubeconfigPath, setKubeconfigPath] = useState<string>("");
  const [manifests, setManifests] = useState<KubernetesManifest[]>([]);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [pods, setPods] = useState<Awaited<ReturnType<typeof api.getPods>>>([]);
  const [logs, setLogs] = useState<ProjectLogLine[]>([]);
  const [logWorkload, setLogWorkload] = useState<CommerceWorkload>("api");
  const [localAccess, setLocalAccess] = useState<LocalAccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("Ready");
  const [busy, setBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.spec.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const replaceProject = useCallback((project: ProvisionedProject) => {
    setProjects((current) => {
      const exists = current.some((item) => item.spec.id === project.spec.id);
      const next = exists
        ? current.map((item) =>
            item.spec.id === project.spec.id ? project : item,
          )
        : [project, ...current];

      return next.sort((a, b) => a.spec.name.localeCompare(b.spec.name));
    });
    setSelectedId(project.spec.id);
    setIsCreating(false);
    setStatus(project.status);
  }, []);

  const loadProjects = useCallback(async () => {
    setError(null);
    try {
      const [healthResponse, projectList] = await Promise.all([
        api.health(),
        api.listProjects(),
      ]);
      setHealth(healthResponse.status);
      setKubeMode(healthResponse.kubernetes.mode);
      setKubeconfigPath(healthResponse.kubernetes.kubeconfigPath ?? "");
      setProjects(projectList);
      setSelectedId((current) => current ?? projectList[0]?.spec.id ?? null);

      if (projectList.length === 0) {
        setIsCreating(true);
        setActiveTab("config");
      } else {
        setIsCreating((current) => current && projectList.length === 0);
      }
    } catch (caught) {
      setHealth("offline");
      setError(caught instanceof Error ? caught.message : "Failed to load");
    }
  }, []);

  const refreshRuntime = useCallback(
    async (projectId: string, workload: CommerceWorkload = logWorkload) => {
      const [nextStatus, nextPods, nextLogs] = await Promise.all([
        api.getStatus(projectId),
        api.getPods(projectId),
        api.getLogs(projectId, workload),
      ]);
      setStatus(nextStatus);
      setPods(nextPods);
      setLogs(nextLogs);
      setProjects((current) =>
        current.map((project) =>
          project.spec.id === projectId
            ? { ...project, status: nextStatus }
            : project,
        ),
      );
    },
    [logWorkload],
  );

  const refreshManifests = useCallback(async (projectId: string) => {
    setManifests(await api.getManifests(projectId));
  }, []);

  const refreshLocalAccess = useCallback(async (projectId: string) => {
    const nextLocalAccess = await api.getLocalAccess(projectId);
    setLocalAccess(nextLocalAccess);
    return nextLocalAccess;
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProject || isCreating) {
      return;
    }

    if (hydratedProjectId === selectedProject.spec.id) {
      return;
    }

    setDraft(draftFromProject(selectedProject));
    setEnvRows(envDraftsFromProject(selectedProject));
    setStatus(selectedProject.status);
    setPods([]);
    setLogs([]);
    setLocalAccess(null);
    setHydratedProjectId(selectedProject.spec.id);
    void refreshManifests(selectedProject.spec.id);
    void refreshLocalAccess(selectedProject.spec.id).catch(
      (caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load local access",
        );
      },
    );
  }, [
    hydratedProjectId,
    isCreating,
    refreshLocalAccess,
    refreshManifests,
    selectedProject,
  ]);

  const updateDraft = <K extends keyof ProjectDraft>(
    key: K,
    value: ProjectDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleNewProject = () => {
    setIsCreating(true);
    setSelectedId(null);
    setHydratedProjectId(null);
    setActiveTab("config");
    setDraft(defaultDraft);
    setEnvRows([]);
    setManifests([]);
    setStatus(null);
    setPods([]);
    setLogs([]);
    setLocalAccess(null);
  };

  const handleSaveProject = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...requestFromDraft(draft), env: envRows };
      const project =
        isCreating || !selectedProject
          ? await api.createProject(payload)
          : await api.updateProject(selectedProject.spec.id, payload);
      replaceProject(project);
      setNotice(isCreating ? "Project created" : "Project updated");
      await refreshManifests(project.spec.id);
      await refreshLocalAccess(project.spec.id);
      await refreshRuntime(project.spec.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEnv = async () => {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const project = await api.patchEnv(selectedProject.spec.id, {
        mode: "replace",
        env: envRows.map((row) => ({
          key: row.key,
          value: row.value,
          scope: row.scope,
          secret: row.secret,
        })),
      });
      replaceProject(project);
      setNotice("Environment applied");
      await refreshManifests(project.spec.id);
      await refreshRuntime(project.spec.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Env update failed");
    } finally {
      setBusy(false);
    }
  };

  const handleProjectAction = async (
    action: "apply" | "redeploy" | "delete",
  ) => {
    if (!selectedProject) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        await api.deleteProject(selectedProject.spec.id);
        setProjects((current) =>
          current.filter(
            (project) => project.spec.id !== selectedProject.spec.id,
          ),
        );
        handleNewProject();
        setNotice("Project deleted");
        return;
      }

      const project =
        action === "apply"
          ? await api.applyProject(selectedProject.spec.id)
          : await api.redeployProject(selectedProject.spec.id);
      replaceProject(project);
      setNotice(action === "apply" ? "Resources applied" : "Redeploy queued");
      await refreshRuntime(project.spec.id);
      await refreshManifests(project.spec.id);
      await refreshLocalAccess(project.spec.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  };

  const addEnvRow = () => {
    setEnvRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        key: "FEATURE_FLAG",
        value: "true",
        scope: "all",
        secret: false,
      },
    ]);
  };

  const updateEnvRow = <K extends keyof ProjectEnvVar>(
    id: string,
    key: K,
    value: ProjectEnvVar[K],
  ) => {
    setEnvRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
  };

  const removeEnvRow = (id: string) => {
    setEnvRows((current) => current.filter((row) => row.id !== id));
  };

  const handleLocalAccess = async (
    action: "start" | "stop",
    workload?: CommerceWorkload,
  ) => {
    if (!selectedProject) {
      return;
    }

    setLocalBusy(true);
    setError(null);
    try {
      const input = workload ? { workloads: [workload] } : {};
      const nextLocalAccess =
        action === "start"
          ? await api.startLocalAccess(selectedProject.spec.id, input)
          : await api.stopLocalAccess(selectedProject.spec.id, input);
      setLocalAccess(nextLocalAccess);
      setNotice(
        action === "start" ? "Local access started" : "Local access stopped",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Local access action failed",
      );
    } finally {
      setLocalBusy(false);
    }
  };

  const workloadCount = selectedProject?.status.workloads.length ?? 0;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[288px_1fr]">
      <aside className="border-b border-zinc-200 bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-5">
          <div>
            <div className="text-sm font-semibold">Scalable Commerce</div>
            <div className="text-xs text-zinc-500">Provisioning</div>
          </div>
          <span
            className={cx(
              "h-2.5 w-2.5 rounded-full",
              health === "ok" ? "bg-emerald-500" : "bg-red-500",
            )}
          />
        </div>

        <div className="space-y-3 p-4">
          <Button icon={Plus} variant="primary" onClick={handleNewProject}>
            New project
          </Button>

          <div className="space-y-2">
            {projects.map((project) => (
              <button
                key={project.spec.id}
                type="button"
                onClick={() => {
                  setSelectedId(project.spec.id);
                  setIsCreating(false);
                  setHydratedProjectId(null);
                  setActiveTab("overview");
                }}
                className={cx(
                  "w-full rounded-md border px-3 py-3 text-left transition",
                  selectedId === project.spec.id && !isCreating
                    ? "border-zinc-900 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:bg-zinc-50",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {project.spec.name}
                  </span>
                  <StatusPill phase={project.status.phase} />
                </div>
                <div
                  className={cx(
                    "mt-1 truncate text-xs",
                    selectedId === project.spec.id && !isCreating
                      ? "text-zinc-300"
                      : "text-zinc-500",
                  )}
                >
                  {project.spec.namespace}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex min-h-16 flex-col gap-3 border-b border-zinc-200 bg-white px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">
              {isCreating
                ? "Create ecommerce suite"
                : selectedProject?.spec.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <span>{kubeMode === "live" ? "Live Kubernetes" : "Dry run"}</span>
              {kubeconfigPath ? <span>{kubeconfigPath}</span> : null}
              {selectedProject ? (
                <span>{selectedProject.spec.namespace}</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              icon={RefreshCw}
              variant="secondary"
              disabled={busy}
              onClick={() => void loadProjects()}
            >
              Refresh
            </Button>
            {!isCreating && selectedProject ? (
              <>
                <Button
                  icon={Rocket}
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleProjectAction("apply")}
                >
                  Apply
                </Button>
                <Button
                  icon={Cable}
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleProjectAction("redeploy")}
                >
                  Redeploy
                </Button>
                <Button
                  icon={Trash2}
                  variant="danger"
                  disabled={busy}
                  onClick={() => void handleProjectAction("delete")}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </header>

        <div className="p-5">
          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-md border border-zinc-300 bg-white p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cx(
                    "inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-medium",
                    activeTab === tab.id
                      ? "bg-zinc-950 text-white"
                      : "text-zinc-600 hover:bg-zinc-100",
                  )}
                >
                  <tab.icon size={15} aria-hidden="true" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-sm text-zinc-500">{notice}</div>
          </div>

          {activeTab === "overview" && (
            <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-md border border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold">Project state</h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        {selectedProject?.spec.slug ?? "new-project"}
                      </p>
                    </div>
                    <StatusPill phase={status?.phase ?? "draft"} />
                  </div>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Namespace"
                    value={selectedProject?.spec.namespace ?? "pending"}
                  />
                  <Metric label="Workloads" value={String(workloadCount)} />
                  <Metric label="Postgres" value={draft.postgresMode} />
                  <Metric
                    label="Ingress"
                    value={draft.ingressEnabled ? "enabled" : "disabled"}
                  />
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Shield size={18} aria-hidden="true" />
                  <h2 className="text-base font-semibold">Apply mode</h2>
                </div>
                <div className="space-y-3 text-sm text-zinc-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Kubernetes mode</span>
                    <StatusPill phase={kubeMode} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Kubeconfig</span>
                    <span className="truncate text-right text-zinc-900">
                      {kubeconfigPath || "not loaded"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-white xl:col-span-2">
                <div className="border-b border-zinc-200 px-5 py-4">
                  <h2 className="text-base font-semibold">Workloads</h2>
                </div>
                <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
                  {(status?.workloads ?? []).map((workload) => (
                    <div
                      key={`${workload.kind}-${workload.name}`}
                      className="rounded-md border border-zinc-200 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {workload.name}
                        </span>
                        <StatusPill phase={workload.phase} />
                      </div>
                      <div className="mt-3 text-2xl font-semibold">
                        {workload.ready}/{workload.desired}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {workload.kind}
                      </div>
                    </div>
                  ))}
                  {(status?.workloads.length ?? 0) === 0 ? (
                    <div className="rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">
                      No workload status yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          )}

          {activeTab === "config" && (
            <section className="rounded-md border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 px-5 py-4">
                <h2 className="text-base font-semibold">Suite configuration</h2>
              </div>
              <div className="grid gap-6 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Project name">
                    <TextInput
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft("name", event.target.value)
                      }
                      placeholder="Spring Market"
                    />
                  </Field>
                  <Field label="Slug">
                    <TextInput
                      value={draft.slug}
                      disabled={!isCreating}
                      onChange={(event) =>
                        updateDraft("slug", event.target.value)
                      }
                      placeholder="spring-market"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <Field label="API image">
                    <TextInput
                      value={draft.apiImage}
                      onChange={(event) =>
                        updateDraft("apiImage", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Web image">
                    <TextInput
                      value={draft.webImage}
                      onChange={(event) =>
                        updateDraft("webImage", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Admin image">
                    <TextInput
                      value={draft.adminWebImage}
                      onChange={(event) =>
                        updateDraft("adminWebImage", event.target.value)
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="API replicas">
                    <TextInput
                      type="number"
                      min={1}
                      value={draft.apiReplicas}
                      onChange={(event) =>
                        updateDraft("apiReplicas", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Web replicas">
                    <TextInput
                      type="number"
                      min={1}
                      value={draft.webReplicas}
                      onChange={(event) =>
                        updateDraft("webReplicas", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Admin replicas">
                    <TextInput
                      type="number"
                      min={1}
                      value={draft.adminWebReplicas}
                      onChange={(event) =>
                        updateDraft("adminWebReplicas", event.target.value)
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Resource limits
                    </h3>
                  </div>
                  <ResourceRow
                    label="API"
                    cpuRequest={draft.apiCpuRequest}
                    cpuLimit={draft.apiCpuLimit}
                    memoryRequestMi={draft.apiMemoryRequestMi}
                    memoryLimitMi={draft.apiMemoryLimitMi}
                    onCpuRequest={(value) =>
                      updateDraft("apiCpuRequest", value)
                    }
                    onCpuLimit={(value) => updateDraft("apiCpuLimit", value)}
                    onMemoryRequestMi={(value) =>
                      updateDraft("apiMemoryRequestMi", value)
                    }
                    onMemoryLimitMi={(value) =>
                      updateDraft("apiMemoryLimitMi", value)
                    }
                  />
                  <ResourceRow
                    label="Web"
                    cpuRequest={draft.webCpuRequest}
                    cpuLimit={draft.webCpuLimit}
                    memoryRequestMi={draft.webMemoryRequestMi}
                    memoryLimitMi={draft.webMemoryLimitMi}
                    onCpuRequest={(value) =>
                      updateDraft("webCpuRequest", value)
                    }
                    onCpuLimit={(value) => updateDraft("webCpuLimit", value)}
                    onMemoryRequestMi={(value) =>
                      updateDraft("webMemoryRequestMi", value)
                    }
                    onMemoryLimitMi={(value) =>
                      updateDraft("webMemoryLimitMi", value)
                    }
                  />
                  <ResourceRow
                    label="Admin"
                    cpuRequest={draft.adminWebCpuRequest}
                    cpuLimit={draft.adminWebCpuLimit}
                    memoryRequestMi={draft.adminWebMemoryRequestMi}
                    memoryLimitMi={draft.adminWebMemoryLimitMi}
                    onCpuRequest={(value) =>
                      updateDraft("adminWebCpuRequest", value)
                    }
                    onCpuLimit={(value) =>
                      updateDraft("adminWebCpuLimit", value)
                    }
                    onMemoryRequestMi={(value) =>
                      updateDraft("adminWebMemoryRequestMi", value)
                    }
                    onMemoryLimitMi={(value) =>
                      updateDraft("adminWebMemoryLimitMi", value)
                    }
                  />
                  <ResourceRow
                    label="Postgres"
                    cpuRequest={draft.postgresCpuRequest}
                    cpuLimit={draft.postgresCpuLimit}
                    memoryRequestMi={draft.postgresMemoryRequestMi}
                    memoryLimitMi={draft.postgresMemoryLimitMi}
                    onCpuRequest={(value) =>
                      updateDraft("postgresCpuRequest", value)
                    }
                    onCpuLimit={(value) =>
                      updateDraft("postgresCpuLimit", value)
                    }
                    onMemoryRequestMi={(value) =>
                      updateDraft("postgresMemoryRequestMi", value)
                    }
                    onMemoryLimitMi={(value) =>
                      updateDraft("postgresMemoryLimitMi", value)
                    }
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-[220px_1fr_180px]">
                  <Field label="Postgres mode">
                    <Select
                      value={draft.postgresMode}
                      onChange={(event) =>
                        updateDraft(
                          "postgresMode",
                          event.target.value as "internal" | "external",
                        )
                      }
                    >
                      <option value="internal">Internal StatefulSet</option>
                      <option value="external">External URL</option>
                    </Select>
                  </Field>
                  <Field label="External database URL">
                    <TextInput
                      value={draft.databaseUrl}
                      disabled={draft.postgresMode !== "external"}
                      onChange={(event) =>
                        updateDraft("databaseUrl", event.target.value)
                      }
                      placeholder="postgres://user:pass@host:5432/db"
                    />
                  </Field>
                  <Field label="Storage Gi">
                    <TextInput
                      type="number"
                      min={1}
                      value={draft.storageGi}
                      onChange={(event) =>
                        updateDraft("storageGi", event.target.value)
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-4 xl:grid-cols-[180px_1fr_220px_220px]">
                  <label className="flex h-10 items-center gap-3 text-sm font-medium text-zinc-700">
                    <input
                      type="checkbox"
                      checked={draft.ingressEnabled}
                      onChange={(event) =>
                        updateDraft("ingressEnabled", event.target.checked)
                      }
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    Ingress
                  </label>
                  <Field label="Host">
                    <TextInput
                      value={draft.ingressHost}
                      onChange={(event) =>
                        updateDraft("ingressHost", event.target.value)
                      }
                      placeholder="shop.example.com"
                    />
                  </Field>
                  <Field label="Class name">
                    <TextInput
                      value={draft.ingressClassName}
                      onChange={(event) =>
                        updateDraft("ingressClassName", event.target.value)
                      }
                      placeholder="nginx"
                    />
                  </Field>
                  <Field label="TLS secret">
                    <TextInput
                      value={draft.tlsSecretName}
                      onChange={(event) =>
                        updateDraft("tlsSecretName", event.target.value)
                      }
                      placeholder="shop-tls"
                    />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <Button
                    icon={Save}
                    disabled={busy}
                    onClick={() => void handleSaveProject()}
                  >
                    {isCreating ? "Create suite" : "Save changes"}
                  </Button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "env" && (
            <section className="rounded-md border border-zinc-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <h2 className="text-base font-semibold">
                  Environment variables
                </h2>
                <Button icon={Plus} variant="secondary" onClick={addEnvRow}>
                  Add env
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Key</th>
                      <th className="px-5 py-3 font-medium">Value</th>
                      <th className="px-5 py-3 font-medium">Scope</th>
                      <th className="px-5 py-3 font-medium">Secret</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {envRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-5 py-3">
                          <TextInput
                            value={row.key}
                            onChange={(event) =>
                              updateEnvRow(
                                row.id,
                                "key",
                                event.target.value.toUpperCase(),
                              )
                            }
                          />
                        </td>
                        <td className="px-5 py-3">
                          <TextInput
                            value={row.value}
                            type={row.secret ? "password" : "text"}
                            onChange={(event) =>
                              updateEnvRow(row.id, "value", event.target.value)
                            }
                          />
                        </td>
                        <td className="px-5 py-3">
                          <Select
                            value={row.scope}
                            onChange={(event) =>
                              updateEnvRow(
                                row.id,
                                "scope",
                                event.target.value as ProjectEnvVar["scope"],
                              )
                            }
                          >
                            <option value="all">all</option>
                            {COMMERCE_WORKLOADS.map((workload) => (
                              <option key={workload} value={workload}>
                                {workload}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-5 py-3">
                          <input
                            type="checkbox"
                            checked={row.secret}
                            onChange={(event) =>
                              updateEnvRow(
                                row.id,
                                "secret",
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4 rounded border-zinc-300"
                          />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeEnvRow(row.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                            aria-label="Remove env"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {envRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-8 text-center text-zinc-500"
                        >
                          No custom environment variables.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end border-t border-zinc-200 p-5">
                <Button
                  icon={Save}
                  disabled={busy || !selectedProject}
                  onClick={() => void handleSaveEnv()}
                >
                  Apply env
                </Button>
              </div>
            </section>
          )}

          {activeTab === "runtime" && (
            <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-md border border-zinc-200 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                  <h2 className="text-base font-semibold">Pods</h2>
                  <Button
                    icon={RefreshCw}
                    variant="secondary"
                    disabled={!selectedProject}
                    onClick={() =>
                      selectedProject &&
                      void refreshRuntime(selectedProject.spec.id)
                    }
                  >
                    Refresh runtime
                  </Button>
                </div>
                <div className="divide-y divide-zinc-100">
                  {pods.map((pod) => (
                    <div key={pod.name} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {pod.name}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {pod.component ?? "unknown"}
                          </div>
                        </div>
                        <StatusPill phase={pod.phase.toLowerCase()} />
                      </div>
                      <div className="mt-3 grid gap-2">
                        {pod.containers.map((container) => (
                          <div
                            key={container.name}
                            className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-xs"
                          >
                            <span>{container.name}</span>
                            <span className="text-zinc-500">
                              {container.ready ? "ready" : "not ready"} ·
                              restarts {container.restartCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {pods.length === 0 ? (
                    <div className="px-5 py-8 text-sm text-zinc-500">
                      No pods returned.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                  <h2 className="text-base font-semibold">Logs</h2>
                  <Select
                    value={logWorkload}
                    onChange={(event) => {
                      const workload = event.target.value as CommerceWorkload;
                      setLogWorkload(workload);
                      if (selectedProject) {
                        void refreshRuntime(selectedProject.spec.id, workload);
                      }
                    }}
                    className="max-w-44"
                  >
                    {COMMERCE_WORKLOADS.map((workload) => (
                      <option key={workload} value={workload}>
                        {workload}
                      </option>
                    ))}
                  </Select>
                </div>
                <pre className="max-h-[520px] overflow-auto p-5 text-xs leading-6 text-zinc-700">
                  {logs
                    .map((line) => `${line.timestamp ?? ""} ${line.line}`)
                    .join("\n") || "No logs."}
                </pre>
              </div>
            </section>
          )}

          {activeTab === "local" && (
            <section className="rounded-md border border-zinc-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">Local access</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {selectedProject
                      ? selectedProject.spec.namespace
                      : "Select a project"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={RefreshCw}
                    variant="secondary"
                    disabled={!selectedProject || localBusy}
                    onClick={() =>
                      selectedProject &&
                      void refreshLocalAccess(selectedProject.spec.id)
                    }
                  >
                    Refresh
                  </Button>
                  <Button
                    icon={Power}
                    disabled={!selectedProject || localBusy}
                    onClick={() => void handleLocalAccess("start")}
                  >
                    Start all
                  </Button>
                  <Button
                    icon={Square}
                    variant="secondary"
                    disabled={!selectedProject || localBusy}
                    onClick={() => void handleLocalAccess("stop")}
                  >
                    Stop all
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 p-5 xl:grid-cols-3">
                {(localAccess?.services ?? []).map((service) => (
                  <div
                    key={service.workload}
                    className="rounded-md border border-zinc-200 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {workloadLabels[service.workload]}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {service.serviceName}:{service.targetPort}
                        </div>
                      </div>
                      <StatusPill phase={service.status} />
                    </div>

                    <a
                      href={service.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 flex min-h-10 items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-900 hover:bg-white"
                    >
                      <span className="break-all">{service.url}</span>
                      <ExternalLink
                        className="shrink-0 text-zinc-500"
                        size={15}
                        aria-hidden="true"
                      />
                    </a>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        icon={Power}
                        variant="secondary"
                        disabled={
                          localBusy ||
                          service.status === "running" ||
                          service.status === "starting"
                        }
                        onClick={() =>
                          void handleLocalAccess("start", service.workload)
                        }
                      >
                        Start
                      </Button>
                      <Button
                        icon={Square}
                        variant="ghost"
                        disabled={localBusy || service.status === "stopped"}
                        onClick={() =>
                          void handleLocalAccess("stop", service.workload)
                        }
                      >
                        Stop
                      </Button>
                    </div>

                    {service.message ? (
                      <div className="mt-3 text-xs leading-5 text-zinc-500">
                        {service.message}
                      </div>
                    ) : null}
                  </div>
                ))}

                {!selectedProject ? (
                  <div className="rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">
                    Select or create a project to allocate localhost URLs.
                  </div>
                ) : null}

                {selectedProject && !localAccess ? (
                  <div className="rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">
                    Local access has not been loaded yet.
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {activeTab === "manifests" && (
            <section className="rounded-md border border-zinc-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <h2 className="text-base font-semibold">Generated manifests</h2>
                <Button
                  icon={RefreshCw}
                  variant="secondary"
                  disabled={!selectedProject}
                  onClick={() =>
                    selectedProject &&
                    void refreshManifests(selectedProject.spec.id)
                  }
                >
                  Regenerate
                </Button>
              </div>
              <pre className="max-h-[680px] overflow-auto p-5 text-xs leading-6 text-zinc-700">
                {manifests.length > 0
                  ? JSON.stringify(manifests, null, 2)
                  : "No manifests generated."}
              </pre>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="text-xs font-medium uppercase text-zinc-500">{label}</div>
      <div className="mt-2 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}
