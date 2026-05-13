import crypto from "node:crypto";

import type {
  CommerceImages,
  CommerceProjectSpec,
  CommerceWorkload,
  ContainerResources,
  EnvPatchRequest,
  IngressConfig,
  PostgresConfig,
  ProjectCreateRequest,
  ProjectEnvVar,
  ProjectReplicas,
  ProjectResources,
  ProjectUpdateRequest,
  ResourceTarget,
} from "@repo/deployment-types";

const COMMERCE_WORKLOADS = [
  "api",
  "web",
  "admin-web",
] as const satisfies readonly CommerceWorkload[];
const RESOURCE_TARGETS = [
  ...COMMERCE_WORKLOADS,
  "postgres",
] as const satisfies readonly ResourceTarget[];

const DEFAULT_NAMESPACE_PREFIX = process.env.NAMESPACE_PREFIX ?? "sc";
const DEFAULT_IMAGE_REGISTRY =
  process.env.DEFAULT_IMAGE_REGISTRY ??
  "ghcr.io/devsargam/multi-tenant-commerce";

const DEFAULT_IMAGES: CommerceImages = {
  api: process.env.DEFAULT_API_IMAGE ?? `${DEFAULT_IMAGE_REGISTRY}-api:latest`,
  web: process.env.DEFAULT_WEB_IMAGE ?? `${DEFAULT_IMAGE_REGISTRY}-web:latest`,
  "admin-web":
    process.env.DEFAULT_ADMIN_WEB_IMAGE ??
    `${DEFAULT_IMAGE_REGISTRY}-admin-web:latest`,
};

const DEFAULT_REPLICAS: ProjectReplicas = {
  api: 1,
  web: 1,
  "admin-web": 1,
};

const DEFAULT_RESOURCES: ProjectResources = {
  api: {
    cpuRequest: "250m",
    cpuLimit: "750m",
    memoryRequestMi: 256,
    memoryLimitMi: 768,
  },
  web: {
    cpuRequest: "200m",
    cpuLimit: "500m",
    memoryRequestMi: 256,
    memoryLimitMi: 512,
  },
  "admin-web": {
    cpuRequest: "100m",
    cpuLimit: "300m",
    memoryRequestMi: 128,
    memoryLimitMi: 256,
  },
  postgres: {
    cpuRequest: "250m",
    cpuLimit: "1000m",
    memoryRequestMi: 512,
    memoryLimitMi: 1024,
  },
};

const DEFAULT_POSTGRES: PostgresConfig = {
  mode: "internal",
  storageGi: 5,
};

const DEFAULT_INGRESS: IngressConfig = {
  enabled: false,
};

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const slugify = (value: string) => {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 45);

  return slug || "commerce";
};

export const projectIdForSlug = (slug: string) => slug;

export const namespaceForSlug = (slug: string) =>
  `${DEFAULT_NAMESPACE_PREFIX}-${slug}`;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const parsePositiveInteger = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;

const parseImageConfig = (
  images: unknown,
  fallback: CommerceImages,
): CommerceImages => {
  const record = asRecord(images);

  return {
    api: asString(record.api) || fallback.api,
    web: asString(record.web) || fallback.web,
    "admin-web": asString(record["admin-web"]) || fallback["admin-web"],
  };
};

const parseReplicas = (
  replicas: unknown,
  fallback: ProjectReplicas,
): ProjectReplicas => {
  const record = asRecord(replicas);

  return {
    api: parsePositiveInteger(record.api, fallback.api),
    web: parsePositiveInteger(record.web, fallback.web),
    "admin-web": parsePositiveInteger(
      record["admin-web"],
      fallback["admin-web"],
    ),
  };
};

const parseCpuQuantity = (value: unknown, fallback: string) => {
  const parsed = asString(value);

  if (!parsed) {
    return fallback;
  }

  if (!/^(\d+m|\d+(\.\d+)?)$/.test(parsed)) {
    throw new ValidationError(
      `Invalid CPU quantity "${parsed}". Use values like 250m, 1, or 1.5.`,
    );
  }

  return parsed;
};

const parseMemoryMi = (value: unknown, fallback: number) => {
  const parsed = parsePositiveInteger(value, fallback);

  if (parsed < 64) {
    throw new ValidationError("Memory values must be at least 64 Mi.");
  }

  return parsed;
};

const parseContainerResources = (
  value: unknown,
  fallback: ContainerResources,
): ContainerResources => {
  const record = asRecord(value);
  const resources = {
    cpuRequest: parseCpuQuantity(record.cpuRequest, fallback.cpuRequest),
    cpuLimit: parseCpuQuantity(record.cpuLimit, fallback.cpuLimit),
    memoryRequestMi: parseMemoryMi(
      record.memoryRequestMi,
      fallback.memoryRequestMi,
    ),
    memoryLimitMi: parseMemoryMi(record.memoryLimitMi, fallback.memoryLimitMi),
  };

  if (resources.memoryLimitMi < resources.memoryRequestMi) {
    throw new ValidationError(
      "Memory limit must be greater than or equal to memory request.",
    );
  }

  return resources;
};

const parseResources = (
  resources: unknown,
  fallback: ProjectResources,
): ProjectResources => {
  const record = asRecord(resources);

  return Object.fromEntries(
    RESOURCE_TARGETS.map((target) => [
      target,
      parseContainerResources(record[target], fallback[target]),
    ]),
  ) as ProjectResources;
};

const parsePostgres = (
  postgres: unknown,
  fallback: PostgresConfig,
): PostgresConfig => {
  const record = asRecord(postgres);
  const mode = record.mode === "external" ? "external" : fallback.mode;
  const databaseUrl = asString(record.databaseUrl) || fallback.databaseUrl;
  const storageGi = parsePositiveInteger(record.storageGi, fallback.storageGi);

  if (mode === "external" && !databaseUrl) {
    throw new ValidationError("External Postgres requires databaseUrl.");
  }

  return { mode, databaseUrl, storageGi };
};

const parseIngress = (
  ingress: unknown,
  fallback: IngressConfig,
): IngressConfig => {
  const record = asRecord(ingress);
  const enabled =
    typeof record.enabled === "boolean" ? record.enabled : fallback.enabled;
  const host = asString(record.host) || fallback.host;
  const className = asString(record.className) || fallback.className;
  const tlsSecretName =
    asString(record.tlsSecretName) || fallback.tlsSecretName;

  if (enabled && !host) {
    throw new ValidationError(
      "Ingress host is required when ingress is enabled.",
    );
  }

  return { enabled, host, className, tlsSecretName };
};

const parseEnv = (env: unknown, fallback: ProjectEnvVar[]): ProjectEnvVar[] => {
  if (!Array.isArray(env)) {
    return fallback;
  }

  return env
    .map((item) => {
      const record = asRecord(item);
      const key = asString(record.key).toUpperCase();
      const value = asString(record.value);
      const scope = asString(record.scope);
      const normalizedScope: ProjectEnvVar["scope"] =
        COMMERCE_WORKLOADS.includes(scope as CommerceWorkload)
          ? (scope as CommerceWorkload)
          : "all";

      if (!key || !ENV_KEY_PATTERN.test(key)) {
        throw new ValidationError(
          `Invalid env key "${key}". Use uppercase names like DATABASE_URL.`,
        );
      }

      return {
        key,
        value,
        scope: normalizedScope,
        secret: Boolean(record.secret),
      };
    })
    .sort((a, b) => `${a.scope}:${a.key}`.localeCompare(`${b.scope}:${b.key}`));
};

export const createProjectSpec = (
  input: ProjectCreateRequest,
): CommerceProjectSpec => {
  const name = asString(input.name);

  if (!name) {
    throw new ValidationError("Project name is required.");
  }

  const slug = slugify(input.slug || name);

  return {
    id: projectIdForSlug(slug),
    name,
    slug,
    namespace: namespaceForSlug(slug),
    images: parseImageConfig(input.images, DEFAULT_IMAGES),
    env: parseEnv(input.env, []),
    replicas: parseReplicas(input.replicas, DEFAULT_REPLICAS),
    resources: parseResources(input.resources, DEFAULT_RESOURCES),
    postgres: parsePostgres(input.postgres, DEFAULT_POSTGRES),
    ingress: parseIngress(input.ingress, DEFAULT_INGRESS),
  };
};

export const updateProjectSpec = (
  current: CommerceProjectSpec,
  input: ProjectUpdateRequest,
): CommerceProjectSpec => {
  const nextSlug = input.slug ? slugify(input.slug) : current.slug;

  if (nextSlug !== current.slug) {
    throw new ValidationError(
      "Project slug and namespace are immutable. Create a new project to rename the namespace.",
    );
  }

  return {
    ...current,
    name: asString(input.name) || current.name,
    images: parseImageConfig(input.images, current.images),
    env: parseEnv(input.env, current.env),
    replicas: parseReplicas(input.replicas, current.replicas),
    resources: parseResources(input.resources, current.resources),
    postgres: parsePostgres(input.postgres, current.postgres),
    ingress: parseIngress(input.ingress, current.ingress),
  };
};

export const patchProjectEnv = (
  current: CommerceProjectSpec,
  patch: EnvPatchRequest,
): CommerceProjectSpec => {
  const incoming = parseEnv(patch.env, []);

  if (patch.mode === "replace") {
    return { ...current, env: incoming };
  }

  const merged = new Map<string, ProjectEnvVar>();

  for (const env of current.env) {
    merged.set(`${env.scope}:${env.key}`, env);
  }

  for (const env of incoming) {
    merged.set(`${env.scope}:${env.key}`, env);
  }

  return {
    ...current,
    env: [...merged.values()].sort((a, b) =>
      `${a.scope}:${a.key}`.localeCompare(`${b.scope}:${b.key}`),
    ),
  };
};

export const configHash = (project: CommerceProjectSpec) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        env: project.env,
        images: project.images,
        ingress: project.ingress,
        postgres: project.postgres,
        replicas: project.replicas,
        resources: project.resources,
      }),
    )
    .digest("hex")
    .slice(0, 16);
