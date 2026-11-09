import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Cpu, PlugZap } from "lucide-react";
import { AGENT, DEFAULT_TARGET, pick, useAgentHealth, useAgentMetrics } from "@/api/agent";
import { Empty, PageHeader, Pill, Segmented, Stat } from "@/components/ui";
import { GRAFANA, GrafanaPanel, LOCAL_PANELS, useGrafanaUp, type LocalPanelKey } from "@/components/GrafanaPanel";
import { compact } from "@/lib/format";

const RANGES = [{ id: "5m", label: "5m" }, { id: "15m", label: "15m" }, { id: "1h", label: "1h" }, { id: "6h", label: "6h" }] as const;
const TARGET_KEY = "cloudlm.local.target";

const readTarget = () => { try { return localStorage.getItem(TARGET_KEY) || DEFAULT_TARGET; } catch { return DEFAULT_TARGET; } };

const num = (v: number | undefined, digits = 1) => (v === undefined || Number.isNaN(v) ? "—" : v < 1000 ? v.toFixed(digits) : compact(v));

export default function Local() {
  const [target, setTargetState] = useState(readTarget);
  const [draft, setDraft] = useState(target);
  const setTarget = (t: string) => {
    setTargetState(t);
    try { localStorage.setItem(TARGET_KEY, t); } catch { /* ignore */ }
  };
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("15m");

  const health = useAgentHealth();
  const m = useAgentMetrics(target);
  const grafana = useGrafanaUp();
  const series = m.data?.series ?? [];
  const agentUp = health.data === true;

  return (
    <>
      <PageHeader title="Local" sub="A model on this machine, scraped by the local agent and charted by a local Grafana." />

      <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          Agent
          <Pill tone={agentUp ? "good" : health.isLoading ? "neutral" : "bad"}>{agentUp ? "connected" : health.isLoading ? "checking" : "offline"}</Pill>
        </span>
        <span className="flex items-center gap-2">
          Engine
          <Pill tone={m.data ? "good" : m.isError ? "bad" : "neutral"}>{m.data ? "scraping" : m.isError ? "unreachable" : "…"}</Pill>
        </span>
        <span className="flex items-center gap-2">
          Grafana
          <Pill tone={grafana ? "good" : grafana === null ? "neutral" : "warn"}>{grafana ? "connected" : grafana === null ? "checking" : "offline"}</Pill>
        </span>
        {m.data?.model && <span className="truncate text-ink-2"><Cpu size={14} className="mr-1 inline" />{m.data.model}</span>}
        <form className="ml-auto flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setTarget(draft.trim() || DEFAULT_TARGET); }}>
          <label htmlFor="target" className="text-ink-3">Target</label>
          <input id="target" className="input !w-44 font-mono !text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={DEFAULT_TARGET} />
          <button className="btn-ghost" type="submit" disabled={draft === target}>Apply</button>
        </form>
      </div>

      {!agentUp && !health.isLoading ? (
        <Empty icon={<PlugZap size={28} />} title="Can't reach the local agent">
          <p>The page calls <code className="font-mono">{AGENT}/metrics/{target}</code>. Start the engine and the agent, then this page connects by itself:</p>
          <pre className="mt-3 rounded-lg bg-surface-2 p-3 text-left font-mono text-xs">{`python test\\test.py            # engine on 127.0.0.1:3000
cd agent\\local; go run .        # agent on :8080`}</pre>
        </Empty>
      ) : m.isError ? (
        <Empty icon={<PlugZap size={28} />} title="Agent is up, but it can't scrape the engine">
          <p className="font-mono text-xs">{(m.error as Error).message}</p>
          <p className="mt-2">The target must equal the agent's <code className="font-mono">HOST:PORT</code> (default {DEFAULT_TARGET}), and the engine must be running.</p>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Generation tok/s" value={num(m.rates?.genPerSec)} sub={m.rates?.msPerToken ? `${m.rates.msPerToken.toFixed(0)} ms / token` : "Waiting for traffic"} />
            <Stat label="Prompt tok/s" value={num(m.rates?.promptPerSec)} sub={`${compact(pick(series, "promptTotal") ?? 0)} prompt tokens total`} />
            <Stat label="Requests processing" value={num(pick(series, "running"), 0)} sub={`${num(pick(series, "waiting"), 0)} deferred`} />
            <Stat label="Tokens generated" value={compact(pick(series, "genTotal") ?? 0)} sub="Since the engine started" />
          </div>

          <div className="card mt-4">
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-sm font-medium">Generation throughput: live from the agent</span>
              <span className="text-xs text-ink-3">polled every 2s · kept in this tab only</span>
            </div>
            <LiveChart data={m.history} />
          </div>
        </>
      )}

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Grafana</h2>
        <Segmented value={range} onChange={setRange} options={[...RANGES]} />
      </div>
      {grafana === false ? (
        <div className="card px-5 py-4 text-sm text-ink-2">
          Grafana isn't answering at <code className="font-mono">{GRAFANA}</code>. Start the local stack, which runs Prometheus scraping the engine and a Grafana with the <code className="font-mono">cloudlm-local</code> dashboard provisioned:
          <pre className="mt-3 rounded-lg bg-surface-2 p-3 font-mono text-xs">docker compose -f deploy/docker-compose.local.yml up -d</pre>
          Then reload this page.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(Object.keys(LOCAL_PANELS) as LocalPanelKey[]).map((k) => (
            <GrafanaPanel key={k} dashboard="local" panel={k} range={range} refresh="5s" />
          ))}
        </div>
      )}

      {series.length > 0 && (
        <details className="card mt-8">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Raw agent output ({series.length} series)</summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-3"><tr><th className="px-4 py-2 font-medium">Metric</th><th className="px-4 py-2 font-medium">Labels</th><th className="px-4 py-2 text-right font-medium">Value</th></tr></thead>
              <tbody className="divide-y divide-line font-mono">
                {series.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-1.5">{s.name}</td>
                    <td className="px-4 py-1.5 text-ink-2">{Object.entries(s.labels).map(([k, v]) => `${k}="${v}"`).join(", ")}</td>
                    <td className="tnum px-4 py-1.5 text-right">{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}

function LiveChart({ data }: { data: { t: number; gen: number }[] }) {
  const fmtT = (t: number) => new Date(t).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" });
  return (
    <div className="h-48 px-1 pb-2 pt-2">
      {data.length < 2 ? (
        <div className="grid h-full place-items-center text-sm text-ink-3">Collecting samples…</div>
      ) : (
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="g-local-gen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={fmtT} tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--text-3)" }} labelFormatter={(t: number) => new Date(t).toLocaleTimeString()}
              formatter={(v: number) => [`${v.toFixed(1)} tok/s`, "Generation"]} />
            <Area type="stepAfter" dataKey="gen" stroke="var(--series-1)" strokeWidth={2} fill="url(#g-local-gen)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
