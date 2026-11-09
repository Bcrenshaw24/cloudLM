import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink } from "lucide-react";
import { rng } from "@/api/seed";

export const GRAFANA = import.meta.env.VITE_GRAFANA_URL ?? "/grafana";

interface PanelDef { id: number; title: string; unit: string; base: number; amp: number }

// The vLLM perf dashboard the agent's metrics land in. Panel ids match the
// provisioned dashboard; each has a mock generator for when Grafana is absent.
export const VLLM_PANELS = {
  throughput: { id: 1, title: "Generation throughput", unit: "tok/s", base: 8000, amp: 0.25 },
  ttft: { id: 2, title: "Time to first token (p95)", unit: "ms", base: 220, amp: 0.35 },
  tpot: { id: 3, title: "Time per output token (p50)", unit: "ms", base: 14, amp: 0.15 },
  kv: { id: 4, title: "KV cache usage", unit: "%", base: 62, amp: 0.2 },
  running: { id: 5, title: "Requests running", unit: "", base: 48, amp: 0.4 },
  waiting: { id: 6, title: "Requests waiting", unit: "", base: 3, amp: 1.2 },
} as const satisfies Record<string, PanelDef>;
export type PanelKey = keyof typeof VLLM_PANELS;

// Local engine dashboard (deploy/grafana/dashboards/cloudlm-local.json). Queries
// cover both llama.cpp and vLLM metric names, so either engine works.
export const LOCAL_PANELS = {
  genRate: { id: 1, title: "Generation throughput", unit: "tok/s", base: 0, amp: 0 },
  promptRate: { id: 2, title: "Prompt throughput", unit: "tok/s", base: 0, amp: 0 },
  msPerToken: { id: 3, title: "Avg time per output token", unit: "ms", base: 0, amp: 0 },
  running: { id: 4, title: "Requests processing", unit: "", base: 0, amp: 0 },
  waiting: { id: 5, title: "Requests deferred", unit: "", base: 0, amp: 0 },
  genTotal: { id: 6, title: "Tokens generated (total)", unit: "", base: 0, amp: 0 },
} as const satisfies Record<string, PanelDef>;
export type LocalPanelKey = keyof typeof LOCAL_PANELS;

const DASHBOARDS = {
  vllm: { uid: "cloudlm-vllm", slug: "vllm", panels: VLLM_PANELS as Record<string, PanelDef> },
  local: { uid: "cloudlm-local", slug: "local", panels: LOCAL_PANELS as Record<string, PanelDef> },
};

let grafanaUp: Promise<boolean> | null = null;
export const probeGrafana = () =>
  (grafanaUp ??= fetch(`${GRAFANA}/api/health`).then((r) => r.ok && (r.headers.get("content-type") ?? "").includes("json")).catch(() => false));

export function useGrafanaUp() {
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => { probeGrafana().then(setLive); }, []);
  return live;
}

type Props =
  | { dashboard?: "vllm"; panel: PanelKey }
  | { dashboard: "local"; panel: LocalPanelKey };

export function GrafanaPanel({ dashboard = "vllm", panel, deployment = "All", range = "1h", height = 220, scale = 1, refresh = "30s" }: Props & {
  deployment?: string; range?: string; height?: number; scale?: number; refresh?: string;
}) {
  const d = DASHBOARDS[dashboard];
  const p = d.panels[panel];
  const live = useGrafanaUp();

  const theme = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const vars = dashboard === "vllm" ? `&var-deployment=${encodeURIComponent(deployment)}` : "";
  const src = `${GRAFANA}/d-solo/${d.uid}/${d.slug}?orgId=1&panelId=${p.id}${vars}&from=now-${range}&to=now&refresh=${refresh}&theme=${theme}`;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="text-sm font-medium">{p.title}</div>
        <a className="flex items-center gap-1 text-xs text-ink-3 hover:text-accent" target="_blank" rel="noreferrer"
          href={`${GRAFANA}/d/${d.uid}/${d.slug}?orgId=1${vars}&from=now-${range}`}>
          {live ? "Grafana" : dashboard === "local" ? "Grafana (offline)" : "Grafana (mock)"} <ExternalLink size={12} />
        </a>
      </div>
      {live ? (
        <iframe title={p.title} src={src} style={{ height }} className="w-full border-0" />
      ) : dashboard === "local" ? (
        // No fake data for the local box: say what's missing instead.
        <div style={{ height }} className="grid place-items-center px-6 text-center text-sm text-ink-3">
          {live === null ? "Checking Grafana…" : "Grafana isn't reachable at " + GRAFANA}
        </div>
      ) : (
        <MockSeries panel={panel as PanelKey} seedKey={deployment + panel + range} height={height} scale={scale} />
      )}
    </div>
  );
}

function MockSeries({ panel, seedKey, height, scale }: { panel: PanelKey; seedKey: string; height: number; scale: number }) {
  const p = VLLM_PANELS[panel];
  const data = useMemo(() => {
    let h = 0;
    for (const c of seedKey) h = (h * 31 + c.charCodeAt(0)) | 0;
    const r = rng(h);
    return Array.from({ length: 60 }, (_, i) => {
      const v = p.base * scale * (1 + p.amp * (Math.sin(i / 7) * 0.6 + (r() - 0.5)));
      return { t: `${String(Math.floor(i / 60 * 60)).padStart(2, "0")}m`, v: Math.max(0, panel === "kv" ? Math.min(99, v) : v) };
    });
  }, [seedKey, p, scale, panel]);
  const fmt = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v < 20 ? v.toFixed(1) : Math.round(v).toString());
  return (
    <div style={{ height }} className="px-1 pb-2 pt-2">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${panel}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} interval={14} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={40} tickFormatter={fmt} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--text-3)" }} formatter={(v: number) => [`${fmt(v)} ${p.unit}`, p.title]} />
          <Area type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} fill={`url(#g-${panel})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
