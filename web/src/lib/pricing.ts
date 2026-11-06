import type { CloudProvider, Deployment, GpuType, PricingTable } from "@/types";

export const PROVIDERS: { id: CloudProvider; name: string }[] = [
  { id: "aws", name: "AWS" },
  { id: "gcp", name: "Google Cloud" },
  { id: "azure", name: "Azure" },
  { id: "coreweave", name: "CoreWeave" },
  { id: "lambda", name: "Lambda" },
];

export const providerName = (p: CloudProvider) => PROVIDERS.find((x) => x.id === p)!.name;

export const GPU_TYPES: GpuType[] = ["H100-80G", "A100-80G", "L40S", "L4", "A10G"];

// MOCK list prices (USD per GPU-hour, on-demand). Illustrative only; the real
// service would sync these from provider pricing APIs.
export const MOCK_PRICING: PricingTable = {
  updatedAt: "2026-11-01",
  gpuHourly: {
    aws: { "H100-80G": 3.93, "A100-80G": 2.75, L40S: 1.86, L4: 0.8, A10G: 1.01 },
    gcp: { "H100-80G": 3.88, "A100-80G": 3.67, L4: 0.71 },
    azure: { "H100-80G": 6.98, "A100-80G": 3.67, A10G: 1.1 },
    coreweave: { "H100-80G": 6.16, "A100-80G": 2.21, L40S: 2.25 },
    lambda: { "H100-80G": 2.99, "A100-80G": 1.79, A10G: 0.75 },
  },
};

export type Commitment = "on_demand" | "1yr" | "3yr" | "spot";
export const COMMITMENTS: { id: Commitment; label: string; discount: number }[] = [
  { id: "on_demand", label: "On-demand", discount: 0 },
  { id: "1yr", label: "1-yr commit", discount: 0.3 },
  { id: "3yr", label: "3-yr commit", discount: 0.5 },
  { id: "spot", label: "Spot / preemptible", discount: 0.6 },
];

export const HOURS_PER_MONTH = 730;

export function gpuPrice(table: PricingTable, provider: CloudProvider, gpu: GpuType): number | undefined {
  return table.gpuHourly[provider][gpu];
}

/** Average replicas a deployment runs: weighted toward min with autoscaling headroom. */
export const avgReplicas = (d: Pick<Deployment, "replicas">) =>
  d.replicas.min + (d.replicas.max - d.replicas.min) * 0.35;

export function deploymentHourly(
  table: PricingTable,
  provider: CloudProvider,
  d: Pick<Deployment, "gpuType" | "gpusPerReplica" | "replicas">,
  commitment: Commitment = "on_demand",
): number | undefined {
  const p = gpuPrice(table, provider, d.gpuType);
  if (p === undefined) return undefined;
  const disc = COMMITMENTS.find((c) => c.id === commitment)!.discount;
  return p * (1 - disc) * d.gpusPerReplica * avgReplicas(d);
}

/** $ per 1M generated tokens given the fleet's hourly cost and measured throughput. */
export function costPer1M(hourly: number, tokensPerSec: number): number {
  if (tokensPerSec <= 0) return 0;
  return hourly / ((tokensPerSec * 3600) / 1_000_000);
}

/**
 * 12-month projection: traffic grows `growth` per month; replicas scale up once
 * current per-replica throughput at `targetUtil` is exceeded.
 */
export function projectMonthly(
  table: PricingTable,
  provider: CloudProvider,
  fleet: Deployment[],
  commitment: Commitment,
  growth: number,
  months = 12,
): { month: number; cost: number; unpriced: number }[] {
  const out = [];
  for (let m = 0; m < months; m++) {
    const factor = Math.pow(1 + growth, m);
    let cost = 0;
    let unpriced = 0;
    for (const d of fleet) {
      const scaled = { ...d, replicas: { min: Math.ceil(d.replicas.min * factor), max: Math.ceil(d.replicas.max * factor) } };
      const h = deploymentHourly(table, provider, scaled, commitment);
      if (h === undefined) unpriced++;
      else cost += h * HOURS_PER_MONTH;
    }
    out.push({ month: m, cost, unpriced });
  }
  return out;
}
