import { useState } from "react";
import { ShieldCheck, ShieldOff, ThumbsDown, ThumbsUp, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { useCapture, useDeployments, useTraceFeedback, useTraces, useUpdateCapture } from "@/api/hooks";
import { Drawer, Empty, Modal, PageHeader, Pill, Segmented, Stat, Toggle } from "@/components/ui";
import { ago, ms, pct } from "@/lib/format";
import type { TraceSample } from "@/types";

type Filter = "all" | "flagged" | "low" | "down";

export default function Quality() {
  const { data: cap } = useCapture();
  const { data: traces = [] } = useTraces();
  const { data: deps = [] } = useDeployments();
  const updCap = useUpdateCapture();
  const [filter, setFilter] = useState<Filter>("all");
  const [dep, setDep] = useState("all");
  const [open, setOpen] = useState<TraceSample | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  if (!cap) return null;

  const scoped = traces.filter((t) => dep === "all" || t.deploymentId === dep);
  const shown = scoped.filter((t) =>
    filter === "flagged" ? t.hallucination !== "none" : filter === "low" ? t.qualityScore < 0.6 : filter === "down" ? t.userFeedback === "down" : true);
  const avgQ = scoped.reduce((a, t) => a + t.qualityScore, 0) / (scoped.length || 1);
  const hall = scoped.filter((t) => t.hallucination !== "none").length;
  const depName = (id: string) => deps.find((d) => d.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title="Quality & traces" sub="Sampled prompts and responses, scored by an LLM judge for quality and hallucinations. Opt-in only."
        actions={cap.consentGranted
          ? <button className="btn-outline" onClick={() => updCap.mutate({ consentGranted: false })}><ShieldOff size={15} /> Revoke capture</button>
          : <button className="btn-primary" onClick={() => setConsentOpen(true)}><ShieldCheck size={15} /> Enable prompt capture</button>} />

      <div className="card mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 p-4 text-sm">
        <div className="flex items-center gap-2">
          {cap.consentGranted ? <Pill tone="good"><ShieldCheck size={12} /> Consent on file</Pill> : <Pill>Capture disabled</Pill>}
          {cap.consentAt && cap.consentGranted && <span className="text-xs text-ink-3">by {cap.consentBy}, {ago(cap.consentAt)}</span>}
        </div>
        <label className="flex items-center gap-2">Sample rate
          <select className="input !w-auto !py-1" value={cap.sampleRate} onChange={(e) => updCap.mutate({ sampleRate: Number(e.target.value) })}>
            {[0.01, 0.05, 0.1, 0.25, 1].map((r) => <option key={r} value={r}>{pct(r, 0)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">Redact PII <Toggle checked={cap.redactPII} onChange={(v) => updCap.mutate({ redactPII: v })} label="Redact PII" /></label>
        <label className="flex items-center gap-2">Retention
          <select className="input !w-auto !py-1" value={cap.retentionDays} onChange={(e) => updCap.mutate({ retentionDays: Number(e.target.value) })}>
            {[7, 30, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <span className="text-xs text-ink-3">Judge: <span className="font-mono">{cap.judgeModel}</span></span>
      </div>

      {!cap.consentGranted ? (
        <Empty icon={<ShieldOff size={32} />} title="Prompt capture is off">
          Nothing leaves your cluster except metrics. Enabling capture lets the agent sample request/response pairs from deployments you opt in,
          redact PII in-cluster, and send them for quality scoring.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Samples (window)" value={scoped.length} />
            <Stat label="Avg quality score" value={avgQ.toFixed(2)} />
            <Stat label="Hallucination flags" value={hall} sub={pct(hall / (scoped.length || 1)) + " of samples"} />
            <Stat label="Negative feedback" value={scoped.filter((t) => t.userFeedback === "down").length} />
          </div>

          <div className="my-4 flex flex-wrap items-center gap-3">
            <Segmented value={filter} onChange={setFilter} options={[{ id: "all", label: "All" }, { id: "flagged", label: "Hallucination flagged" }, { id: "low", label: "Low quality" }, { id: "down", label: "👎 feedback" }]} />
            <select className="input !w-60" value={dep} onChange={(e) => setDep(e.target.value)}>
              <option value="all">All deployments</option>
              {deps.filter((d) => d.promptCapture).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="card divide-y divide-line">
            {shown.map((t) => (
              <button key={t.id} onClick={() => setOpen(t)} className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-surface-2/60">
                <ScoreDot score={t.qualityScore} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.prompt}</div>
                  <div className="truncate text-sm text-ink-2">{t.response}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <span>{depName(t.deploymentId)}</span>{t.variant && <Pill>variant {t.variant}</Pill>}<span>· {ms(t.latencyMs)} · {ago(t.timestamp)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.hallucination !== "none" && <Pill tone={t.hallucination === "confirmed" ? "bad" : "warn"}><AlertTriangle size={12} /> {t.hallucination}</Pill>}
                  {t.userFeedback === "up" && <ThumbsUp size={14} className="text-ink-3" />}
                  {t.userFeedback === "down" && <ThumbsDown size={14} className="text-critical-text" />}
                </div>
              </button>
            ))}
            {!shown.length && <div className="px-4 py-10 text-center text-sm text-ink-2">No samples match.</div>}
          </div>
        </>
      )}

      {open && <TraceDrawer t={open} depName={depName(open.deploymentId)} onClose={() => setOpen(null)} />}
      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Enable prompt & response capture">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Only deployments with capture toggled on are sampled ({pct(cap.sampleRate, 0)} of requests).</li>
          <li>PII is redacted inside your cluster by the agent before upload.</li>
          <li>Samples are deleted after {cap.retentionDays} days. You can revoke at any time.</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setConsentOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => { updCap.mutate({ consentGranted: true }); setConsentOpen(false); }}>I consent on behalf of my org</button>
        </div>
      </Modal>
    </>
  );
}

function ScoreDot({ score }: { score: number }) {
  const tone = score >= 0.8 ? "text-good-text" : score >= 0.6 ? "text-warning-text" : "text-critical-text";
  return <span className={clsx("tnum mt-0.5 w-10 shrink-0 text-sm font-semibold", tone)} title="Quality score">{score.toFixed(2)}</span>;
}

function TraceDrawer({ t, depName, onClose }: { t: TraceSample; depName: string; onClose: () => void }) {
  const fb = useTraceFeedback();
  const [mine, setMine] = useState(t.userFeedback);
  const rate = (v: "up" | "down") => { setMine(v); fb.mutate({ id: t.id, fb: v }); };
  return (
    <Drawer open onClose={onClose} title={`Trace ${t.id}`}>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Pill>{depName}</Pill>{t.variant && <Pill>variant {t.variant}</Pill>}
        <Pill>{t.promptTokens} in / {t.completionTokens} out tok</Pill><Pill>TTFT {ms(t.ttftMs)}</Pill><Pill>total {ms(t.latencyMs)}</Pill>
      </div>
      <div className="label">Prompt</div>
      <div className="mb-4 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{t.prompt}</div>
      <div className="label">Response</div>
      <div className="mb-4 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-[13px]">{t.response}</div>
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Judge assessment</span>
          <span className="flex items-center gap-2"><ScoreDot score={t.qualityScore} />
            {t.hallucination !== "none" ? <Pill tone={t.hallucination === "confirmed" ? "bad" : "warn"}><AlertTriangle size={12} /> {t.hallucination}</Pill> : <Pill tone="good">grounded</Pill>}
          </span>
        </div>
        {t.judgeNotes && <p className="mt-2 text-sm text-ink-2">{t.judgeNotes}</p>}
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm text-ink-2">
        Your review:
        <button className={clsx("btn-outline !p-1.5", mine === "up" && "!border-accent !text-accent")} onClick={() => rate("up")} aria-label="Good"><ThumbsUp size={15} /></button>
        <button className={clsx("btn-outline !p-1.5", mine === "down" && "!border-critical !text-critical-text")} onClick={() => rate("down")} aria-label="Bad"><ThumbsDown size={15} /></button>
      </div>
    </Drawer>
  );
}
