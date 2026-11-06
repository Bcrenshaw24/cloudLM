// Mock control plane. Same surface a real REST client would expose, backed by
// localStorage so CRUD survives reloads. Deployment changes walk through the
// lifecycle the real agent would drive: pending_sync -> deploying -> running.
import type { CaptureSettings, Cluster, Deployment, DeploymentSpec, Experiment, TraceSample } from "@/types";
import { seedCapture, seedClusters, seedDeployments, seedExperiments, seedTraces } from "./seed";
import { MOCK_PRICING } from "@/lib/pricing";

interface DB {
  v: number;
  clusters: Cluster[];
  deployments: Deployment[];
  experiments: Experiment[];
  capture: CaptureSettings;
  traces: TraceSample[];
}

const KEY = "cloudlm.mockdb";
const VERSION = 1;

function fresh(): DB {
  return {
    v: VERSION,
    clusters: seedClusters,
    deployments: seedDeployments,
    experiments: seedExperiments,
    capture: seedCapture,
    traces: seedTraces(seedDeployments),
  };
}

let db: DB = load();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.v === VERSION) return parsed;
    }
  } catch {
    /* storage unavailable: fall through to in-memory seed */
  }
  return fresh();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

const clone = <T,>(x: T): T => structuredClone(x);
const delay = <T,>(x: T, ms = 180 + Math.random() * 220) => new Promise<T>((r) => setTimeout(() => r(clone(x)), ms));
const nowIso = () => new Date().toISOString();

// Small jitter so live numbers feel live on each poll.
function jitter(d: Deployment): Deployment {
  if (d.status !== "running" && d.status !== "degraded") return d;
  const j = (v: number, f = 0.06) => v * (1 + (Math.random() - 0.5) * f);
  return {
    ...d,
    live: {
      requestsPerSec: j(d.live.requestsPerSec),
      tokensPerSec: j(d.live.tokensPerSec),
      ttftP95Ms: j(d.live.ttftP95Ms, 0.1),
      tpotP50Ms: j(d.live.tpotP50Ms, 0.04),
      kvCacheUsage: Math.min(0.99, j(d.live.kvCacheUsage, 0.05)),
      errorRate: d.live.errorRate,
    },
  };
}

function simulateReconcile(id: string, version: number) {
  const step = (status: Deployment["status"], after: number, patch: Partial<Deployment> = {}) =>
    setTimeout(() => {
      const d = db.deployments.find((x) => x.id === id);
      if (!d || d.specVersion !== version) return; // superseded by a newer change
      Object.assign(d, { status, ...patch });
      save();
    }, after);
  step("deploying", 2500);
  step("running", 7000, { observedVersion: version });
  setTimeout(() => {
    const d = db.deployments.find((x) => x.id === id);
    if (d && d.specVersion === version) {
      d.readyReplicas = d.replicas.min;
      save();
    }
  }, 7000);
}

function estimateLive(spec: DeploymentSpec): Deployment["live"] {
  const perGpu: Record<string, number> = { "H100-80G": 2600, "A100-80G": 1700, L40S: 1100, L4: 650, A10G: 520 };
  const tps = (perGpu[spec.gpuType] ?? 800) * spec.gpusPerReplica * spec.replicas.min;
  return { requestsPerSec: tps / 240, tokensPerSec: tps, ttftP95Ms: 200 + Math.random() * 200, tpotP50Ms: 12 + Math.random() * 10, kvCacheUsage: 0.35, errorRate: 0.001 };
}

export const api = {
  reset() {
    db = fresh();
    save();
  },

  pricing: () => delay(MOCK_PRICING),
  clusters: () => delay(db.clusters),

  deployments: () => delay(db.deployments.map(jitter)),
  deployment: (id: string) => {
    const d = db.deployments.find((x) => x.id === id);
    return d ? delay(jitter(d)) : Promise.reject(new Error("Not found"));
  },

  createDeployment(spec: DeploymentSpec) {
    if (db.deployments.some((d) => d.name === spec.name && d.clusterId === spec.clusterId))
      return Promise.reject(new Error(`A deployment named "${spec.name}" already exists in that cluster.`));
    const d: Deployment = {
      ...spec,
      id: "d-" + Math.random().toString(36).slice(2, 9),
      status: "pending_sync",
      readyReplicas: 0,
      specVersion: 1,
      observedVersion: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      live: estimateLive(spec),
    };
    db.deployments.unshift(d);
    save();
    simulateReconcile(d.id, 1);
    return delay(d);
  },

  updateDeployment(id: string, spec: DeploymentSpec) {
    const d = db.deployments.find((x) => x.id === id);
    if (!d) return Promise.reject(new Error("Not found"));
    Object.assign(d, spec, { specVersion: d.specVersion + 1, status: "pending_sync", updatedAt: nowIso() });
    save();
    simulateReconcile(id, d.specVersion);
    return delay(d);
  },

  deleteDeployment(id: string) {
    const d = db.deployments.find((x) => x.id === id);
    if (!d) return Promise.reject(new Error("Not found"));
    const inUse = db.experiments.find((e) => e.status === "running" && e.variants.some((v) => v.deploymentId === id));
    if (inUse) return Promise.reject(new Error(`Used by running experiment "${inUse.name}". Stop it first.`));
    d.status = "deleting";
    save();
    setTimeout(() => {
      db.deployments = db.deployments.filter((x) => x.id !== id);
      save();
    }, 3000);
    return delay(null);
  },

  experiments: () => delay(db.experiments),
  experiment: (id: string) => {
    const e = db.experiments.find((x) => x.id === id);
    return e ? delay(e) : Promise.reject(new Error("Not found"));
  },
  createExperiment(e: Omit<Experiment, "id" | "status">) {
    const exp: Experiment = { ...e, id: "e-" + Math.random().toString(36).slice(2, 9), status: "running", startedAt: nowIso() };
    db.experiments.unshift(exp);
    save();
    return delay(exp);
  },
  updateExperiment(id: string, patch: Partial<Pick<Experiment, "status" | "variants" | "endedAt">>) {
    const e = db.experiments.find((x) => x.id === id);
    if (!e) return Promise.reject(new Error("Not found"));
    Object.assign(e, patch);
    save();
    return delay(e);
  },

  capture: () => delay(db.capture),
  updateCapture(patch: Partial<CaptureSettings>) {
    Object.assign(db.capture, patch);
    if (patch.consentGranted === true) Object.assign(db.capture, { consentBy: "you@acme.io", consentAt: nowIso() });
    save();
    return delay(db.capture);
  },

  traces: () => delay(db.capture.consentGranted ? db.traces : []),
  setTraceFeedback(id: string, fb: "up" | "down") {
    const t = db.traces.find((x) => x.id === id);
    if (t) t.userFeedback = fb;
    save();
    return delay(t);
  },
};
