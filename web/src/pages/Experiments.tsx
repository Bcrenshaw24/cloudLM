import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Pause, Play, Plus, Trophy } from "lucide-react";
import { useCreateExperiment, useDeployments, useExperiments, useUpdateExperiment } from "@/api/hooks";
import { Modal, PageHeader, Pill } from "@/components/ui";
import { ago, compact, ms, pct, usd } from "@/lib/format";
import type { Deployment, Experiment, PrimaryMetric, VariantResult } from "@/types";

const METRICS: { id: PrimaryMetric; label: string }[] = [
  { id: "quality_score", label: "Quality score" },
  { id: "thumbs_up_rate", label: "Thumbs-up rate" },
  { id: "ttft_p95", label: "TTFT p95" },
  { id: "cost_per_1m", label: "Cost / 1M tokens" },
];

export default function Experiments() {
  const { id } = useParams();
  return id ? <Detail id={id} /> : <List />;
}

function List() {
  const { data: exps = [] } = useExperiments();
  const { data: deps = [] } = useDeployments();
  const [creating, setCreating] = useState(false);
  const name = (id: string) => deps.find((d) => d.id === id)?.name ?? id;
  return (
    <>
      <PageHeader title="A/B experiments" sub="Split live traffic on a route between two deployments and compare latency, cost and quality."
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New experiment</button>} />
      <div className="grid gap-3">
        {exps.map((e) => (
          <Link key={e.id} to={`/experiments/${e.id}`} className="card block p-4 transition-colors hover:border-line-strong">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{e.name}</span>
              <Pill tone={e.status === "running" ? "good" : "neutral"}>{e.status}</Pill>
              <span className="ml-auto text-xs text-ink-3">route <span className="font-mono">{e.routeKey}</span>{e.startedAt && ` · started ${ago(e.startedAt)}`}</span>
            </div>
            <p className="mt-1 text-sm text-ink-2">{e.hypothesis}</p>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full">
              <div style={{ width: `${e.variants[0].weight}%`, background: "var(--series-1)" }} />
              <div className="w-0.5 bg-surface" />
              <div style={{ width: `${e.variants[1].weight}%`, background: "var(--series-2)" }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-ink-2">
              <span>A · {name(e.variants[0].deploymentId)} · {e.variants[0].weight}%</span>
              <span>B · {name(e.variants[1].deploymentId)} · {e.variants[1].weight}%</span>
            </div>
          </Link>
        ))}
      </div>
      {creating && <CreateExperiment deps={deps} onClose={() => setCreating(false)} />}
    </>
  );
}

// Two-proportion z-test on thumbs-up rate → two-sided p-value.
function pValue(a: VariantResult, b: VariantResult) {
  const p1 = a.feedbackUp / a.feedbackTotal, p2 = b.feedbackUp / b.feedbackTotal;
  const p = (a.feedbackUp + b.feedbackUp) / (a.feedbackTotal + b.feedbackTotal);
  const se = Math.sqrt(p * (1 - p) * (1 / a.feedbackTotal + 1 / b.feedbackTotal));
  const z = Math.abs(p1 - p2) / se;
  // Abramowitz-Stegun normal CDF approximation
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 2 * tail;
}

function Detail({ id }: { id: string }) {
  const { data: exps = [] } = useExperiments();
  const { data: deps = [] } = useDeployments();
  const upd = useUpdateExperiment();
  const e = exps.find((x) => x.id === id);
  if (!e) return null;
  const [A, B] = e.variants;
  const ra = A.result, rb = B.result;
  const dep = (vid: string) => deps.find((d) => d.id === vid);

  const rows: { label: string; a: number; b: number; fmt: (n: number) => string; better: "lower" | "higher"; metric?: PrimaryMetric }[] = ra && rb ? [
    { label: "Requests", a: ra.requests, b: rb.requests, fmt: compact, better: "higher" },
    { label: "TTFT p50", a: ra.ttftP50Ms, b: rb.ttftP50Ms, fmt: ms, better: "lower" },
    { label: "TTFT p95", a: ra.ttftP95Ms, b: rb.ttftP95Ms, fmt: ms, better: "lower", metric: "ttft_p95" },
    { label: "Time / output token", a: ra.tpotP50Ms, b: rb.tpotP50Ms, fmt: (n) => n.toFixed(1) + " ms", better: "lower" },
    { label: "Cost / 1M tokens", a: ra.costPer1MTokens, b: rb.costPer1MTokens, fmt: (n) => usd(n, 3), better: "lower", metric: "cost_per_1m" },
    { label: "Quality score (LLM judge)", a: ra.qualityScore, b: rb.qualityScore, fmt: (n) => n.toFixed(3), better: "higher", metric: "quality_score" },
    { label: "Hallucination rate", a: ra.hallucinationRate, b: rb.hallucinationRate, fmt: (n) => pct(n), better: "lower" },
    { label: "Thumbs-up rate", a: ra.feedbackUp / ra.feedbackTotal, b: rb.feedbackUp / rb.feedbackTotal, fmt: (n) => pct(n), better: "higher", metric: "thumbs_up_rate" },
  ] : [];
  const p = ra && rb ? pValue(ra, rb) : 1;
  const chart = ra && rb ? ra.series.map((s, i) => ({ t: new Date(s.t).getHours() + ":00", A: s.ttftP95Ms, B: rb.series[i]?.ttftP95Ms })) : [];

  const setWeight = (wa: number) => upd.mutate({ id, patch: { variants: [{ ...A, weight: wa }, { ...B, weight: 100 - wa }] } });
  const promote = (k: "A" | "B") => upd.mutate({ id, patch: { status: "completed", endedAt: new Date().toISOString(), variants: [{ ...A, weight: k === "A" ? 100 : 0 }, { ...B, weight: k === "B" ? 100 : 0 }] } });

  return (
    <>
      <Link to="/experiments" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Experiments</Link>
      <PageHeader title={e.name} sub={e.hypothesis} actions={e.status !== "completed" && <>
        <button className="btn-outline" onClick={() => upd.mutate({ id, patch: { status: e.status === "running" ? "paused" : "running" } })}>
          {e.status === "running" ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Resume</>}
        </button>
        <button className="btn-outline" onClick={() => promote("A")}><Trophy size={15} /> Promote A</button>
        <button className="btn-primary" onClick={() => promote("B")}><Trophy size={15} /> Promote B</button>
      </>} />

      <div className="grid gap-4 md:grid-cols-2">
        {[A, B].map((v, i) => {
          const d = dep(v.deploymentId);
          return (
            <div key={v.key} className="card p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: i ? "var(--series-2)" : "var(--series-1)" }} />
                <span className="font-medium">Variant {v.key}</span>
                <span className="tnum ml-auto text-2xl font-semibold">{v.weight}%</span>
              </div>
              <div className="mt-2 font-medium">{d?.name ?? "deleted deployment"}</div>
              {d && <div className="font-mono text-xs text-ink-3">{d.model} · {d.gpusPerReplica}× {d.gpuType}</div>}
            </div>
          );
        })}
      </div>

      {e.status !== "completed" && (
        <div className="card mt-4 flex items-center gap-4 p-4">
          <span className="text-sm text-ink-2">Traffic split</span>
          <input key={A.weight} type="range" min={0} max={100} step={5} defaultValue={A.weight} onMouseUp={(ev) => setWeight(Number((ev.target as HTMLInputElement).value))}
            onKeyUp={(ev) => setWeight(Number((ev.target as HTMLInputElement).value))} className="flex-1 accent-[var(--accent)]" />
          <span className="tnum w-24 text-right text-sm">A {A.weight} / B {B.weight}</span>
        </div>
      )}

      {ra && rb && (
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <div className="card overflow-x-auto lg:col-span-3">
            <table className="w-full">
              <thead className="border-b border-line"><tr><th className="th">Metric</th><th className="th text-right">A</th><th className="th text-right">B</th><th className="th text-right">B vs A</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const delta = (r.b - r.a) / r.a;
                  const good = r.label === "Requests" ? null : (r.better === "lower" ? delta < 0 : delta > 0);
                  return (
                    <tr key={r.label} className={r.metric === e.primaryMetric ? "bg-accent-soft/50" : ""}>
                      <td className="td">{r.label}{r.metric === e.primaryMetric && <Pill tone="accent">primary</Pill>}</td>
                      <td className="td tnum text-right">{r.fmt(r.a)}</td>
                      <td className="td tnum text-right">{r.fmt(r.b)}</td>
                      <td className={`td tnum text-right font-medium ${good === null ? "text-ink-3" : good ? "text-good-text" : "text-critical-text"}`}>
                        {good === null ? "" : good ? "▲ " : "▼ "}{(delta * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-line px-4 py-3 text-xs text-ink-2">
              Thumbs-up difference: p = {p < 0.001 ? "<0.001" : p.toFixed(3)} ·{" "}
              {p < 0.05 ? <span className="font-medium text-good-text">statistically significant</span> : <span>not yet significant, keep collecting</span>}
            </div>
          </div>
          <div className="card p-4 lg:col-span-2">
            <div className="mb-2 text-sm font-medium">TTFT p95 · last 24h</div>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} width={40} unit="ms" />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} itemStyle={{ color: "var(--text)" }} />
                  <Legend iconType="plainline" formatter={(k) => <span className="text-xs text-ink-2">Variant {k}</span>} />
                  <Line dataKey="A" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="B" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      {!ra && <p className="mt-6 text-sm text-ink-2">Collecting data. Results appear once both variants have served traffic.</p>}
    </>
  );
}

function CreateExperiment({ deps, onClose }: { deps: Deployment[]; onClose: () => void }) {
  const create = useCreateExperiment();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", hypothesis: "", routeKey: "", a: deps[0]?.id ?? "", b: deps[1]?.id ?? "", wa: 50, metric: "quality_score" as PrimaryMetric });
  const valid = f.name && f.routeKey && f.a && f.b && f.a !== f.b;
  const submit = () => {
    const e: Omit<Experiment, "id" | "status"> = {
      name: f.name, hypothesis: f.hypothesis, routeKey: f.routeKey, primaryMetric: f.metric,
      variants: [{ key: "A", deploymentId: f.a, weight: f.wa }, { key: "B", deploymentId: f.b, weight: 100 - f.wa }],
    };
    create.mutate(e, { onSuccess: (x) => { onClose(); nav(`/experiments/${x.id}`); } });
  };
  return (
    <Modal open onClose={onClose} title="New A/B experiment">
      <div className="space-y-3">
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">Hypothesis</label><input className="input" value={f.hypothesis} onChange={(e) => setF({ ...f, hypothesis: e.target.value })} /></div>
        <div><label className="label">Route (model alias clients call)</label><input className="input font-mono" placeholder="chat-small" value={f.routeKey} onChange={(e) => setF({ ...f, routeKey: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((k) => (
            <div key={k}><label className="label">Variant {k.toUpperCase()}</label>
              <select className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </div>
          ))}
        </div>
        <div><label className="label">Split: A {f.wa}% / B {100 - f.wa}%</label><input type="range" min={5} max={95} step={5} value={f.wa} onChange={(e) => setF({ ...f, wa: Number(e.target.value) })} className="w-full accent-[var(--accent)]" /></div>
        <div><label className="label">Primary metric</label>
          <select className="input" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as PrimaryMetric })}>{METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        </div>
        {f.a === f.b && <p className="text-xs text-critical-text">Pick two different deployments.</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!valid || create.isPending} onClick={submit}>Start experiment</button>
      </div>
    </Modal>
  );
}
