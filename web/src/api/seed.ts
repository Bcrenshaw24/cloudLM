import type { CaptureSettings, Cluster, Deployment, Experiment, TraceSample, VariantResult } from "@/types";
import { defaultArgs } from "@/lib/engines";

// Deterministic RNG so the mock data looks the same on every fresh load.
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const H = 3600_000;
const D = 24 * H;

export const seedClusters: Cluster[] = [
  { id: "c-prod-use1", name: "prod-us-east-1", provider: "aws", region: "us-east-1", agentVersion: "0.4.2", agentMode: "manage", lastSeen: iso(8_000), gpuInventory: { "A100-80G": 16, "H100-80G": 16, L4: 24, L40S: 8 } },
  { id: "c-cw-lga", name: "gpu-burst-lga", provider: "coreweave", region: "LGA1", agentVersion: "0.4.2", agentMode: "manage", lastSeen: iso(14_000), gpuInventory: { "H100-80G": 32 } },
  { id: "c-edge-gcp", name: "edge-europe-west4", provider: "gcp", region: "europe-west4", agentVersion: "0.3.9", agentMode: "observe", lastSeen: iso(42_000), gpuInventory: { L4: 8 } },
];

type Seed = Omit<Deployment, "engineArgs" | "status" | "readyReplicas" | "specVersion" | "observedVersion" | "createdAt" | "updatedAt"> & {
  engineArgs?: Deployment["engineArgs"];
  status?: Deployment["status"];
};

const base = (s: Seed, i: number): Deployment => ({
  ...s,
  engineArgs: { ...defaultArgs(s.engine), ...s.engineArgs },
  status: s.status ?? "running",
  readyReplicas: s.status === "degraded" ? Math.max(0, s.replicas.min - 1) : s.replicas.min + (i % 2),
  specVersion: 3 + i,
  observedVersion: 3 + i,
  createdAt: iso((40 - i * 5) * D),
  updatedAt: iso((i + 1) * 9 * H),
});

export const seedDeployments: Deployment[] = ([
  { id: "d-llama8b", name: "llama-3-1-8b-chat", model: "meta-llama/Llama-3.1-8B-Instruct", engine: "vllm", engineVersion: "0.11.0", clusterId: "c-prod-use1", namespace: "llm-serving", gpuType: "A100-80G", gpusPerReplica: 1, replicas: { min: 2, max: 6 }, promptCapture: true, live: { requestsPerSec: 41.2, tokensPerSec: 9820, ttftP95Ms: 184, tpotP50Ms: 11.4, kvCacheUsage: 0.62, errorRate: 0.0012 } },
  { id: "d-llama8b-awq", name: "llama-3-1-8b-awq", model: "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4", engine: "vllm", engineVersion: "0.11.0", engineArgs: { quantization: "awq" }, clusterId: "c-prod-use1", namespace: "llm-serving", gpuType: "L4", gpusPerReplica: 1, replicas: { min: 2, max: 8 }, promptCapture: true, live: { requestsPerSec: 39.8, tokensPerSec: 6110, ttftP95Ms: 262, tpotP50Ms: 17.9, kvCacheUsage: 0.71, errorRate: 0.0019 } },
  { id: "d-qwen32b", name: "qwen3-32b-support", model: "Qwen/Qwen3-32B", engine: "vllm", engineVersion: "0.10.2", engineArgs: { tensor_parallel_size: 2, max_model_len: 32768 }, clusterId: "c-prod-use1", namespace: "llm-serving", gpuType: "H100-80G", gpusPerReplica: 2, replicas: { min: 2, max: 4 }, promptCapture: true, live: { requestsPerSec: 18.6, tokensPerSec: 7420, ttftP95Ms: 311, tpotP50Ms: 19.2, kvCacheUsage: 0.48, errorRate: 0.0008 } },
  { id: "d-llama70b", name: "llama-3-3-70b", model: "meta-llama/Llama-3.3-70B-Instruct", engine: "sglang", engineVersion: "0.5.3", engineArgs: { tp: 4 }, clusterId: "c-cw-lga", namespace: "inference", gpuType: "H100-80G", gpusPerReplica: 4, replicas: { min: 1, max: 3 }, promptCapture: true, live: { requestsPerSec: 6.3, tokensPerSec: 3150, ttftP95Ms: 524, tpotP50Ms: 28.7, kvCacheUsage: 0.81, errorRate: 0.0031 } },
  { id: "d-mistral24b", name: "mistral-small-24b", model: "mistralai/Mistral-Small-3.2-24B-Instruct-2506", engine: "tgi", engineVersion: "3.3.4", engineArgs: { num_shard: 2 }, clusterId: "c-prod-use1", namespace: "batch", gpuType: "L40S", gpusPerReplica: 2, replicas: { min: 2, max: 2 }, promptCapture: false, status: "degraded", live: { requestsPerSec: 3.1, tokensPerSec: 890, ttftP95Ms: 1410, tpotP50Ms: 34.0, kvCacheUsage: 0.93, errorRate: 0.042 } },
  { id: "d-gemma4b", name: "gemma-3-4b-edge", model: "google/gemma-3-4b-it", engine: "ollama", engineVersion: "0.12.6", clusterId: "c-edge-gcp", namespace: "edge", gpuType: "L4", gpusPerReplica: 1, replicas: { min: 1, max: 2 }, promptCapture: false, live: { requestsPerSec: 2.4, tokensPerSec: 610, ttftP95Ms: 142, tpotP50Ms: 14.1, kvCacheUsage: 0.3, errorRate: 0.0005 } },
] as Seed[]).map(base);

function result(seed: number, b: { req: number; ttft: number; tpot: number; cost: number; q: number; hall: number; up: number; fb: number }): VariantResult {
  const r = rng(seed);
  const series = Array.from({ length: 24 }, (_, i) => ({
    t: iso((23 - i) * H),
    ttftP95Ms: Math.round(b.ttft * (0.85 + r() * 0.3) * (1 + 0.15 * Math.sin(i / 3.5))),
    qualityScore: Math.min(1, b.q + (r() - 0.5) * 0.06),
  }));
  return {
    requests: b.req,
    ttftP50Ms: Math.round(b.ttft * 0.45),
    ttftP95Ms: b.ttft,
    tpotP50Ms: b.tpot,
    costPer1MTokens: b.cost,
    qualityScore: b.q,
    hallucinationRate: b.hall,
    feedbackUp: b.up,
    feedbackTotal: b.fb,
    series,
  };
}

export const seedExperiments: Experiment[] = [
  {
    id: "e-8b-quant",
    name: "8B: FP16 on A100 vs AWQ-INT4 on L4",
    hypothesis: "AWQ on L4 cuts cost per token by >50% with no meaningful quality drop.",
    status: "running",
    primaryMetric: "cost_per_1m",
    routeKey: "chat-small",
    startedAt: iso(26 * H),
    variants: [
      { key: "A", deploymentId: "d-llama8b", weight: 50, result: result(11, { req: 182_340, ttft: 184, tpot: 11.4, cost: 0.078, q: 0.842, hall: 0.031, up: 1873, fb: 2210 }) },
      { key: "B", deploymentId: "d-llama8b-awq", weight: 50, result: result(12, { req: 181_905, ttft: 262, tpot: 17.9, cost: 0.036, q: 0.829, hall: 0.036, up: 1822, fb: 2194 }) },
    ],
  },
  {
    id: "e-support-70b",
    name: "Support bot: Qwen3-32B vs Llama-3.3-70B",
    hypothesis: "The 70B model reduces hallucinated policy answers enough to justify its cost.",
    status: "running",
    primaryMetric: "quality_score",
    routeKey: "support-agent",
    startedAt: iso(3 * D + 4 * H),
    variants: [
      { key: "A", deploymentId: "d-qwen32b", weight: 80, result: result(21, { req: 96_120, ttft: 311, tpot: 19.2, cost: 0.83, q: 0.871, hall: 0.044, up: 3104, fb: 3690 }) },
      { key: "B", deploymentId: "d-llama70b", weight: 20, result: result(22, { req: 23_870, ttft: 524, tpot: 28.7, cost: 2.17, q: 0.903, hall: 0.021, up: 822, fb: 931 }) },
    ],
  },
  {
    id: "e-ctx-len",
    name: "Prefix caching on vs off (8B)",
    hypothesis: "Prefix caching lowers p95 TTFT on templated prompts by >25%.",
    status: "completed",
    primaryMetric: "ttft_p95",
    routeKey: "chat-small",
    startedAt: iso(14 * D),
    endedAt: iso(11 * D),
    variants: [
      { key: "A", deploymentId: "d-llama8b", weight: 50, result: result(31, { req: 240_400, ttft: 271, tpot: 11.6, cost: 0.081, q: 0.84, hall: 0.03, up: 2400, fb: 2900 }) },
      { key: "B", deploymentId: "d-llama8b", weight: 50, result: result(32, { req: 239_800, ttft: 186, tpot: 11.4, cost: 0.077, q: 0.842, hall: 0.03, up: 2421, fb: 2903 }) },
    ],
  },
];

export const seedCapture: CaptureSettings = {
  consentGranted: true,
  consentBy: "admin@acme.io",
  consentAt: iso(20 * D),
  sampleRate: 0.05,
  redactPII: true,
  retentionDays: 30,
  judgeModel: "claude-sonnet-5-5",
};

const SAMPLES: Omit<TraceSample, "id" | "deploymentId" | "timestamp" | "latencyMs" | "ttftMs" | "promptTokens" | "completionTokens">[] = [
  { prompt: "What's your refund window for annual plans?", response: "Annual plans can be refunded in full within 30 days of purchase. After 30 days, we offer a prorated refund for the remaining full months.", qualityScore: 0.94, hallucination: "none", userFeedback: "up" },
  { prompt: "Can I get a refund on my annual plan after 3 months?", response: "Yes! Our 90-day satisfaction guarantee covers annual plans, so you'll receive a full refund including any add-ons.", qualityScore: 0.31, hallucination: "confirmed", judgeNotes: "Policy states 30-day full refund then prorated; '90-day satisfaction guarantee' does not exist in the retrieved context.", userFeedback: "down" },
  { prompt: "Summarize this ticket: customer [EMAIL] reports SSO login loop after enabling Okta SCIM.", response: "Customer reports an infinite redirect loop on SSO login that began after enabling Okta SCIM provisioning. Likely a mismatched ACS URL or stale session cookie; recommend checking the SAML ACS configuration.", qualityScore: 0.88, hallucination: "none" },
  { prompt: "How do I rotate my API key using the CLI?", response: "Run `acme keys rotate --name <key-name>`. The old key remains valid for 24 hours so you can roll your services without downtime.", qualityScore: 0.9, hallucination: "none", userFeedback: "up" },
  { prompt: "How do I rotate my API key using the CLI?", response: "Use `acme auth regenerate --force --all-regions`. This immediately revokes all existing keys across every region.", qualityScore: 0.42, hallucination: "suspected", judgeNotes: "Command and flags not present in CLI reference docs; consequences stated with high confidence.", userFeedback: "down" },
  { prompt: "Write a SQL query to get the top 5 customers by revenue in 2025.", response: "SELECT customer_id, SUM(amount) AS revenue\nFROM orders\nWHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'\nGROUP BY customer_id\nORDER BY revenue DESC\nLIMIT 5;", qualityScore: 0.96, hallucination: "none" },
  { prompt: "Which regions support data residency?", response: "Data residency is available in the US, EU (Frankfurt), and Australia (Sydney).", qualityScore: 0.62, hallucination: "suspected", judgeNotes: "Retrieved docs list US and EU only; Australia not mentioned.", },
  { prompt: "Translate to French: 'Your order has shipped and will arrive Thursday.'", response: "Votre commande a été expédiée et arrivera jeudi.", qualityScore: 0.97, hallucination: "none", userFeedback: "up" },
  { prompt: "My name is [NAME] and my card ending [CARD] was charged twice. Help?", response: "I'm sorry about the duplicate charge. I've flagged this for billing; duplicate charges are typically reversed within 5–7 business days. You'll get an email confirmation once it's processed.", qualityScore: 0.85, hallucination: "none" },
  { prompt: "What's the rate limit on the batch endpoint?", response: "The batch endpoint allows 50 requests per minute per organization, with up to 10,000 items per batch.", qualityScore: 0.9, hallucination: "none" },
  { prompt: "Who is the CEO of the company and when was it founded?", response: "The company was founded in 2009 by Jordan Ellis, who remains CEO today.", qualityScore: 0.22, hallucination: "confirmed", judgeNotes: "No source supports founder name or year; fabricated entity.", userFeedback: "down" },
  { prompt: "Explain the difference between our Pro and Team plans.", response: "Pro is for individuals: 1 seat, 100 GB storage. Team adds shared workspaces, admin controls, SSO, and pooled storage of 1 TB per 10 seats.", qualityScore: 0.83, hallucination: "none" },
];

export function seedTraces(deployments: Deployment[]): TraceSample[] {
  const r = rng(99);
  const capturing = deployments.filter((d) => d.promptCapture);
  return Array.from({ length: 64 }, (_, i) => {
    const s = SAMPLES[i % SAMPLES.length];
    const d = capturing[Math.floor(r() * capturing.length)];
    const exp = seedExperiments.find((e) => e.status === "running" && e.variants.some((v) => v.deploymentId === d.id));
    const variant = exp?.variants.find((v) => v.deploymentId === d.id)?.key;
    const ttft = Math.round(d.live.ttftP95Ms * (0.35 + r() * 0.7));
    const completionTokens = Math.round(s.response.length / 3.7);
    return {
      ...s,
      id: `t-${(1000 + i).toString(36)}`,
      deploymentId: d.id,
      experimentId: exp?.id,
      variant,
      timestamp: iso(Math.round(i * 7.3 * 60_000 + r() * 60_000)),
      promptTokens: Math.round(180 + r() * 1400),
      completionTokens,
      ttftMs: ttft,
      latencyMs: Math.round(ttft + completionTokens * d.live.tpotP50Ms),
    };
  });
}
