import type {
  ContainerResources,
  CommerceProjectSpec,
  CommerceWorkload,
  EnvScope,
  KubernetesManifest,
  ProjectEnvVar,
} from "@repo/deployment-types";

import { configHash } from "./project.js";

const COMMERCE_WORKLOADS = [
  "api",
  "web",
  "admin-web",
] as const satisfies readonly CommerceWorkload[];

const APP_NAME = "scalable-commerce";
const FIELD_OWNER = "scalable-commerce-orchestrator";
const DEFAULT_DB_NAME = "scalable_commerce";
const DEFAULT_DB_USER = "postgres";

type WorkloadRuntime = {
  containerName: CommerceWorkload;
  serviceName: string;
  port: number;
  readinessPath: string;
};

const WORKLOAD_RUNTIME: Record<CommerceWorkload, WorkloadRuntime> = {
  api: {
    containerName: "api",
    serviceName: "api",
    port: 3001,
    readinessPath: "/health",
  },
  web: {
    containerName: "web",
    serviceName: "web",
    port: 3000,
    readinessPath: "/",
  },
  "admin-web": {
    containerName: "admin-web",
    serviceName: "admin-web",
    port: 3002,
    readinessPath: "/",
  },
};

export const resourceNames = (project: CommerceProjectSpec) => ({
  configMap: `${project.slug}-config`,
  secret: `${project.slug}-secret`,
  migrationJob: `${project.slug.slice(0, 34)}-migration-${configHash(project)}`,
  postgres: `${project.slug}-postgres`,
  ingress: `${project.slug}-ingress`,
  workload: (workload: CommerceWorkload) => `${project.slug}-${workload}`,
});

const labels = (
  project: CommerceProjectSpec,
  component?: string,
): Record<string, string> => ({
  "app.kubernetes.io/name": APP_NAME,
  "app.kubernetes.io/instance": project.slug,
  "app.kubernetes.io/managed-by": FIELD_OWNER,
  ...(component ? { "app.kubernetes.io/component": component } : {}),
});

const envStorageKey = (scope: EnvScope, key: string) => `${scope}.${key}`;

const internalPostgresPassword = (project: CommerceProjectSpec) =>
  `postgres-${project.slug}`;

const internalDatabaseUrl = (project: CommerceProjectSpec) => {
  const names = resourceNames(project);
  return `postgres://${DEFAULT_DB_USER}:${internalPostgresPassword(project)}@${names.postgres}:5432/${DEFAULT_DB_NAME}`;
};

const externalApiUrl = (project: CommerceProjectSpec) =>
  project.ingress.enabled && project.ingress.host
    ? `https://api.${project.ingress.host}`
    : `http://${resourceNames(project).workload("api")}:3001`;

const containerResources = (resources: ContainerResources) => ({
  requests: {
    cpu: resources.cpuRequest,
    memory: `${resources.memoryRequestMi}Mi`,
  },
  limits: {
    cpu: resources.cpuLimit,
    memory: `${resources.memoryLimitMi}Mi`,
  },
});

const defaultEnv = (project: CommerceProjectSpec): ProjectEnvVar[] => [
  {
    key: "DATABASE_URL",
    value:
      project.postgres.mode === "external"
        ? (project.postgres.databaseUrl ?? "")
        : internalDatabaseUrl(project),
    scope: "api",
    secret: true,
  },
  { key: "PORT", value: "3001", scope: "api", secret: false },
  { key: "AUTO_MIGRATE", value: "false", scope: "api", secret: false },
  { key: "SEED_DEMO_DATA", value: "true", scope: "api", secret: false },
  { key: "PORT", value: "3000", scope: "web", secret: false },
  {
    key: "NEXT_PUBLIC_API_URL",
    value: externalApiUrl(project),
    scope: "web",
    secret: false,
  },
  {
    key: "VITE_API_URL",
    value: externalApiUrl(project),
    scope: "admin-web",
    secret: false,
  },
];

const materializedEnv = (project: CommerceProjectSpec) => {
  const merged = new Map<string, ProjectEnvVar>();

  for (const env of defaultEnv(project)) {
    merged.set(`${env.scope}:${env.key}`, env);
  }

  for (const env of project.env) {
    merged.set(`${env.scope}:${env.key}`, env);
  }

  return [...merged.values()].sort((a, b) =>
    `${a.scope}:${a.key}`.localeCompare(`${b.scope}:${b.key}`),
  );
};

const configMapData = (project: CommerceProjectSpec) =>
  Object.fromEntries(
    materializedEnv(project)
      .filter((env) => !env.secret)
      .map((env) => [envStorageKey(env.scope, env.key), env.value]),
  );

const secretStringData = (project: CommerceProjectSpec) => {
  const base: Record<string, string> = {};

  if (project.postgres.mode === "internal") {
    base["postgres.POSTGRES_PASSWORD"] = internalPostgresPassword(project);
  }

  for (const env of materializedEnv(project).filter((entry) => entry.secret)) {
    base[envStorageKey(env.scope, env.key)] = env.value;
  }

  return base;
};

const containerEnvFor = (
  project: CommerceProjectSpec,
  workload: CommerceWorkload,
) => {
  const names = resourceNames(project);

  return materializedEnv(project)
    .filter((env) => env.scope === "all" || env.scope === workload)
    .map((env) => ({
      name: env.key,
      valueFrom: env.secret
        ? {
            secretKeyRef: {
              name: names.secret,
              key: envStorageKey(env.scope, env.key),
            },
          }
        : {
            configMapKeyRef: {
              name: names.configMap,
              key: envStorageKey(env.scope, env.key),
            },
          },
    }));
};

const namespaceManifest = (
  project: CommerceProjectSpec,
): KubernetesManifest => ({
  apiVersion: "v1",
  kind: "Namespace",
  metadata: {
    name: project.namespace,
    labels: labels(project),
  },
});

const configMapManifest = (
  project: CommerceProjectSpec,
): KubernetesManifest => ({
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: {
    name: resourceNames(project).configMap,
    namespace: project.namespace,
    labels: labels(project, "configuration"),
  },
  data: configMapData(project),
});

const secretManifest = (project: CommerceProjectSpec): KubernetesManifest => ({
  apiVersion: "v1",
  kind: "Secret",
  metadata: {
    name: resourceNames(project).secret,
    namespace: project.namespace,
    labels: labels(project, "configuration"),
  },
  type: "Opaque",
  data: Object.fromEntries(
    Object.entries(secretStringData(project)).map(([key, value]) => [
      key,
      Buffer.from(value).toString("base64"),
    ]),
  ),
});

const postgresServiceManifest = (
  project: CommerceProjectSpec,
): KubernetesManifest => ({
  apiVersion: "v1",
  kind: "Service",
  metadata: {
    name: resourceNames(project).postgres,
    namespace: project.namespace,
    labels: labels(project, "postgres"),
  },
  spec: {
    ports: [{ name: "postgres", port: 5432, targetPort: 5432 }],
    selector: labels(project, "postgres"),
  },
});

const postgresStatefulSetManifest = (
  project: CommerceProjectSpec,
): KubernetesManifest => ({
  apiVersion: "apps/v1",
  kind: "StatefulSet",
  metadata: {
    name: resourceNames(project).postgres,
    namespace: project.namespace,
    labels: labels(project, "postgres"),
  },
  spec: {
    serviceName: resourceNames(project).postgres,
    replicas: 1,
    selector: { matchLabels: labels(project, "postgres") },
    template: {
      metadata: { labels: labels(project, "postgres") },
      spec: {
        containers: [
          {
            name: "postgres",
            image: "postgres:16-alpine",
            ports: [{ name: "postgres", containerPort: 5432 }],
            env: [
              { name: "POSTGRES_USER", value: DEFAULT_DB_USER },
              { name: "POSTGRES_DB", value: DEFAULT_DB_NAME },
              {
                name: "POSTGRES_PASSWORD",
                valueFrom: {
                  secretKeyRef: {
                    name: resourceNames(project).secret,
                    key: "postgres.POSTGRES_PASSWORD",
                  },
                },
              },
            ],
            volumeMounts: [
              { name: "postgres-data", mountPath: "/var/lib/postgresql/data" },
            ],
            resources: containerResources(project.resources.postgres),
          },
        ],
      },
    },
    volumeClaimTemplates: [
      {
        metadata: { name: "postgres-data" },
        spec: {
          accessModes: ["ReadWriteOnce"],
          resources: {
            requests: { storage: `${project.postgres.storageGi}Gi` },
          },
        },
      },
    ],
  },
});

const deploymentManifest = (
  project: CommerceProjectSpec,
  workload: CommerceWorkload,
): KubernetesManifest => {
  const runtime = WORKLOAD_RUNTIME[workload];

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: resourceNames(project).workload(workload),
      namespace: project.namespace,
      labels: labels(project, workload),
    },
    spec: {
      replicas: project.replicas[workload],
      selector: { matchLabels: labels(project, workload) },
      template: {
        metadata: {
          labels: labels(project, workload),
          annotations: {
            "scalable-commerce.io/config-hash": configHash(project),
            ...(project.rolloutNonce
              ? { "scalable-commerce.io/restarted-at": project.rolloutNonce }
              : {}),
          },
        },
        spec: {
          containers: [
            {
              name: runtime.containerName,
              image: project.images[workload],
              imagePullPolicy: "IfNotPresent",
              ...(workload === "api"
                ? { command: ["node", "dist/index.js"] }
                : {}),
              ports: [{ name: "http", containerPort: runtime.port }],
              env: containerEnvFor(project, workload),
              resources: containerResources(project.resources[workload]),
              readinessProbe: {
                httpGet: { path: runtime.readinessPath, port: "http" },
                initialDelaySeconds: 5,
                periodSeconds: 10,
              },
              livenessProbe: {
                httpGet: { path: runtime.readinessPath, port: "http" },
                initialDelaySeconds: 20,
                periodSeconds: 20,
              },
            },
          ],
        },
      },
    },
  };
};

const serviceManifest = (
  project: CommerceProjectSpec,
  workload: CommerceWorkload,
): KubernetesManifest => {
  const runtime = WORKLOAD_RUNTIME[workload];

  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: resourceNames(project).workload(workload),
      namespace: project.namespace,
      labels: labels(project, workload),
    },
    spec: {
      ports: [
        {
          name: "http",
          port: runtime.port,
          targetPort: "http",
        },
      ],
      selector: labels(project, workload),
    },
  };
};

const migrationJobManifest = (
  project: CommerceProjectSpec,
): KubernetesManifest => ({
  apiVersion: "batch/v1",
  kind: "Job",
  metadata: {
    name: resourceNames(project).migrationJob,
    namespace: project.namespace,
    labels: labels(project, "migration"),
  },
  spec: {
    backoffLimit: 2,
    ttlSecondsAfterFinished: 86400,
    template: {
      metadata: { labels: labels(project, "migration") },
      spec: {
        restartPolicy: "Never",
        containers: [
          {
            name: "migration",
            image: project.images.api,
            imagePullPolicy: "IfNotPresent",
            command: ["node", "dist/db/migrate.js"],
            env: containerEnvFor(project, "api"),
            resources: containerResources(project.resources.api),
          },
        ],
      },
    },
  },
});

const ingressManifest = (project: CommerceProjectSpec): KubernetesManifest => {
  const host = project.ingress.host ?? project.slug;
  const hosts = [host, `api.${host}`, `admin.${host}`];

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: resourceNames(project).ingress,
      namespace: project.namespace,
      labels: labels(project, "ingress"),
    },
    spec: {
      ...(project.ingress.className
        ? { ingressClassName: project.ingress.className }
        : {}),
      ...(project.ingress.tlsSecretName
        ? { tls: [{ hosts, secretName: project.ingress.tlsSecretName }] }
        : {}),
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: resourceNames(project).workload("web"),
                    port: { number: WORKLOAD_RUNTIME.web.port },
                  },
                },
              },
            ],
          },
        },
        {
          host: `api.${host}`,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: resourceNames(project).workload("api"),
                    port: { number: WORKLOAD_RUNTIME.api.port },
                  },
                },
              },
            ],
          },
        },
        {
          host: `admin.${host}`,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: {
                  service: {
                    name: resourceNames(project).workload("admin-web"),
                    port: { number: WORKLOAD_RUNTIME["admin-web"].port },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
};

export const generateManifests = (
  project: CommerceProjectSpec,
): KubernetesManifest[] => [
  namespaceManifest(project),
  secretManifest(project),
  configMapManifest(project),
  ...(project.postgres.mode === "internal"
    ? [postgresServiceManifest(project), postgresStatefulSetManifest(project)]
    : []),
  migrationJobManifest(project),
  ...COMMERCE_WORKLOADS.flatMap((workload) => [
    deploymentManifest(project, workload),
    serviceManifest(project, workload),
  ]),
  ...(project.ingress.enabled ? [ingressManifest(project)] : []),
];
