// Domain model shared by the GUI and (mirrored in Go) by the control plane and
// the in-cluster agent. A Deployment is *desired state*: the agent pulls the
// spec, reconciles the cluster, and reports observed status back.

export type EngineId = "vllm" | "sglang" | "tgi" | "trtllm" | "ollama" | "llamacpp";

export type CloudProvider = "aws" | "gcp" | "azure" | "coreweave" | "lambda";

export type GpuType = "H100-80G" | "A100-80G" | "L40S" | "L4" | "A10G";

export type DeploymentStatus =
  | "running"
  | "pending_sync" // spec changed, agent hasn't acked yet
  | "deploying"
  | "degraded"
  | "failed"
  | "deleting";

export interface DeploymentSpec {
  name: string; // k8s-safe slug, unique per cluster/namespace
  model: string; // e.g. HF repo id "meta-llama/Llama-3.1-8B-Instruct"
  engine: EngineId;
  engineVersion: string;
  engineArgs: Record<string, string | number | boolean>;
  clusterId: string;
  namespace: string;
  gpuType: GpuType;
  gpusPerReplica: number;
  replicas: { min: number; max: number };
  promptCapture: boolean; // per-deployment opt-in, requires org-level consent too
}

export interface Deployment extends DeploymentSpec {
  id: string;
  status: DeploymentStatus;
  readyReplicas: number;
  specVersion: number; // bumps on every change
  observedVersion: number; // last version the agent reconciled
  createdAt: string;
  updatedAt: string;
  // Rolling live stats summarised by the control plane from agent telemetry.
  live: {
    requestsPerSec: number;
    tokensPerSec: number; // generation tokens / s across replicas
    ttftP95Ms: number;
    tpotP50Ms: number; // time per output token
    kvCacheUsage: number; // 0..1
    errorRate: number; // 0..1
  };
}

export interface Cluster {
  id: string;
  name: string;
  provider: CloudProvider;
  region: string;
  agentVersion: string;
  agentMode: "observe" | "manage"; // RBAC tier granted by the customer
  lastSeen: string;
  gpuInventory: Partial<Record<GpuType, number>>;
}

// ── A/B experiments ─────────────────────────────────────────────────────────
export type ExperimentStatus = "draft" | "running" | "paused" | "completed";
export type PrimaryMetric = "quality_score" | "thumbs_up_rate" | "ttft_p95" | "cost_per_1m";

export interface VariantResult {
  requests: number;
  ttftP50Ms: number;
  ttftP95Ms: number;
  tpotP50Ms: number;
  costPer1MTokens: number;
  qualityScore: number; // 0..1, LLM-judge mean (needs prompt capture)
  hallucinationRate: number; // 0..1
  feedbackUp: number;
  feedbackTotal: number;
  series: { t: string; ttftP95Ms: number; qualityScore: number }[];
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  primaryMetric: PrimaryMetric;
  routeKey: string; // the OpenAI-compatible model alias clients call
  variants: [Variant, Variant];
  startedAt?: string;
  endedAt?: string;
}

export interface Variant {
  key: "A" | "B";
  deploymentId: string;
  weight: number; // 0..100, A+B = 100
  result?: VariantResult;
}

// ── Prompt capture & quality ────────────────────────────────────────────────
export interface CaptureSettings {
  consentGranted: boolean; // org-level, recorded with who/when
  consentBy?: string;
  consentAt?: string;
  sampleRate: number; // 0..1
  redactPII: boolean;
  retentionDays: number;
  judgeModel: string; // model used for LLM-as-judge scoring
}

export interface TraceSample {
  id: string;
  deploymentId: string;
  experimentId?: string;
  variant?: "A" | "B";
  timestamp: string;
  prompt: string;
  response: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  ttftMs: number;
  qualityScore: number; // 0..1
  hallucination: "none" | "suspected" | "confirmed";
  judgeNotes?: string;
  userFeedback?: "up" | "down";
}

export interface PricingTable {
  updatedAt: string;
  // USD per GPU-hour, on-demand list price
  gpuHourly: Record<CloudProvider, Partial<Record<GpuType, number>>>;
}
