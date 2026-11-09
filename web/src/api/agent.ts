import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

// Local agent (agent/local). In dev, Vite proxies /agent -> http://127.0.0.1:8080
// so the browser doesn't need CORS from the agent. Override with VITE_AGENT_URL.
export const AGENT = import.meta.env.VITE_AGENT_URL ?? "/agent";
export const DEFAULT_TARGET = "127.0.0.1:3000";
const POLL_MS = 2000;

// Matrix shape from agent/local/specs.md.
interface MatrixResponse {
  status: "success" | "error";
  error?: string;
  data?: { resultType: "matrix"; result: { metric: Record<string, string>; values: [number, string][] }[] };
}

export interface Series { name: string; labels: Record<string, string>; ts: number; value: number }

export interface AgentSnapshot {
  at: number; // ms, when the browser received it
  series: Series[];
  model?: string;
}

async function fetchMetrics(target: string): Promise<AgentSnapshot> {
  const r = await fetch(`${AGENT}/metrics/${target}`);
  const body = (await r.json().catch(() => null)) as MatrixResponse | null;
  if (!r.ok || !body || body.status !== "success" || !body.data) {
    throw new Error(body?.error ?? `agent returned ${r.status}`);
  }
  const series = body.data.result.map(({ metric, values }) => {
    const { __name__, ...labels } = metric;
    const [ts, v] = values[values.length - 1] ?? [0, "NaN"];
    return { name: __name__, labels, ts, value: Number(v) };
  });
  return { at: Date.now(), series, model: series.find((s) => s.labels.model_name)?.labels.model_name };
}

export const useAgentHealth = () =>
  useQuery({
    queryKey: ["agent", "health"],
    queryFn: async () => (await fetch(`${AGENT}/healthz`)).ok,
    refetchInterval: 5000,
    retry: false,
  });

// Metric names differ per engine; first match wins. Values are summed across label sets.
const NAMES = {
  genTotal: ["llamacpp:tokens_predicted_total", "vllm:generation_tokens_total"],
  promptTotal: ["llamacpp:prompt_tokens_total", "vllm:prompt_tokens_total"],
  genSeconds: ["llamacpp:tokens_predicted_seconds_total"],
  running: ["llamacpp:requests_processing", "vllm:num_requests_running"],
  waiting: ["llamacpp:requests_deferred", "vllm:num_requests_waiting"],
} as const;

export function pick(series: Series[], key: keyof typeof NAMES): number | undefined {
  for (const n of NAMES[key]) {
    const hits = series.filter((s) => s.name === n);
    if (hits.length) return hits.reduce((a, s) => a + s.value, 0);
  }
  return undefined;
}

export interface AgentRates { genPerSec: number; promptPerSec: number; msPerToken?: number }

/** Polls the agent and derives per-second rates from consecutive counter samples. */
export function useAgentMetrics(target: string) {
  const q = useQuery({
    queryKey: ["agent", "metrics", target],
    queryFn: () => fetchMetrics(target),
    refetchInterval: POLL_MS,
    retry: false,
  });

  const prev = useRef<AgentSnapshot | null>(null);
  const [rates, setRates] = useState<AgentRates | null>(null);
  const [history, setHistory] = useState<{ t: number; gen: number }[]>([]);

  useEffect(() => { prev.current = null; setRates(null); setHistory([]); }, [target]);

  useEffect(() => {
    const cur = q.data;
    if (!cur) return;
    const p = prev.current;
    prev.current = cur;
    if (!p || p.at === cur.at) return;
    const dt = (cur.at - p.at) / 1000;
    const d = (k: keyof typeof NAMES) => Math.max(0, (pick(cur.series, k) ?? 0) - (pick(p.series, k) ?? 0)); // clamp counter resets
    const dGen = d("genTotal");
    const dSec = d("genSeconds");
    const r = { genPerSec: dGen / dt, promptPerSec: d("promptTotal") / dt, msPerToken: dGen > 0 && dSec > 0 ? (dSec / dGen) * 1000 : undefined };
    setRates(r);
    setHistory((h) => [...h.slice(-149), { t: cur.at, gen: r.genPerSec }]);
  }, [q.data]);

  return { ...q, rates, history };
}
