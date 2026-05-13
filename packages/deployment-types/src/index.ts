export const COMMERCE_WORKLOADS = ["api", "web", "admin-web"] as const;

export type CommerceWorkload = (typeof COMMERCE_WORKLOADS)[number];

export type CommerceImages = Record<CommerceWorkload, string>;

export type EnvScope = CommerceWorkload | "all";

export type ProjectEnvVar = {
  key: string;
  value: string;
  scope: EnvScope;
  secret: boolean;
};

export type ProjectReplicas = Record<CommerceWorkload, number>;

export type ResourceTarget = CommerceWorkload | "postgres";

export type ContainerResources = {
  cpuRequest: string;
  cpuLimit: string;
  memoryRequestMi: number;
  memoryLimitMi: number;
};

export type ProjectResources = Record<ResourceTarget, ContainerResources>;

export type PostgresMode = "internal" | "external";

export type PostgresConfig = {
  mode: PostgresMode;
  databaseUrl?: string;
  storageGi: number;
};

export type IngressConfig = {
  enabled: boolean;
  host?: string;
  className?: string;
  tlsSecretName?: string;
};

export type CommerceProjectSpec = {
  id: string;
  name: string;
  slug: string;
  namespace: string;
  rolloutNonce?: string;
  images: CommerceImages;
  env: ProjectEnvVar[];
  replicas: ProjectReplicas;
  resources: ProjectResources;
  postgres: PostgresConfig;
  ingress: IngressConfig;
};

export type WorkloadRuntimeStatus = {
  name: CommerceWorkload | "postgres" | "migration";
  kind: "Deployment" | "StatefulSet" | "Job";
  ready: number;
  desired: number;
  phase: "pending" | "progressing" | "ready" | "failed" | "unknown";
  message?: string;
};

export type ProjectStatus = {
  phase: "draft" | "dry-run" | "applying" | "ready" | "failed" | "deleted";
  namespaceReady: boolean;
  workloads: WorkloadRuntimeStatus[];
  lastAppliedAt?: string;
  message?: string;
};

export type ProvisionedProject = {
  spec: CommerceProjectSpec;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCreateRequest = {
  name: string;
  slug?: string;
  images?: Partial<CommerceImages>;
  env?: ProjectEnvVar[];
  replicas?: Partial<ProjectReplicas>;
  resources?: Partial<Record<ResourceTarget, Partial<ContainerResources>>>;
  postgres?: Partial<PostgresConfig>;
  ingress?: Partial<IngressConfig>;
};

export type ProjectUpdateRequest = Partial<
  Omit<ProjectCreateRequest, "name">
> & {
  name?: string;
};

export type EnvPatchRequest = {
  env: ProjectEnvVar[];
  mode?: "replace" | "merge";
};

export type KubernetesManifest = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  [key: string]: unknown;
};

export type ProjectLogLine = {
  pod: string;
  container: string;
  line: string;
  timestamp?: string;
};

export type LocalAccessStatus = "stopped" | "starting" | "running" | "error";

export type LocalAccessTarget = {
  workload: CommerceWorkload;
  namespace: string;
  serviceName: string;
  targetPort: number;
  localPort: number;
  url: string;
  status: LocalAccessStatus;
  message?: string;
  pid?: number;
};

export type LocalAccessState = {
  projectId: string;
  namespace: string;
  services: LocalAccessTarget[];
};

export type LocalAccessActionRequest = {
  workloads?: CommerceWorkload[];
};
