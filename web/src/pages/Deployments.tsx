import { useState } from "react";
import { Pencil, Plus, Trash2, Eye } from "lucide-react";
import clsx from "clsx";
import { useClusters, useDeleteDeployment, useDeployments, usePricing, useSaveDeployment } from "@/api/hooks";
import { Drawer, Modal, PageHeader, Pill, StatusBadge, Toggle } from "@/components/ui";
import { ENGINES, defaultArgs, engineById } from "@/lib/engines";
import { GPU_TYPES, HOURS_PER_MONTH, deploymentHourly } from "@/lib/pricing";
import { compact, ms, slug, usd } from "@/lib/format";
import type { Deployment, DeploymentSpec, EngineId } from "@/types";

export default function Deployments() {
  const { data: deps = [] } = useDeployments();
  const { data: clusters = [] } = useClusters();
  const { data: pricing } = usePricing();
  const [editing, setEditing] = useState<Deployment | "new" | null>(null);
  const [deleting, setDeleting] = useState<Deployment | null>(null);

  return (
    <>
      <PageHeader title="Deployments" sub="Desired state for every model across your clusters. Agents pull changes and reconcile within seconds."
        actions={<button className="btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> Deploy model</button>} />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Deployment</th><th className="th">Engine</th><th className="th">Cluster</th>
              <th className="th">Hardware</th><th className="th text-right">Throughput</th><th className="th text-right">TTFT p95</th>
              <th className="th text-right">Est. / month</th><th className="th">Status</th><th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {deps.map((d) => {
              const c = clusters.find((x) => x.id === d.clusterId);
              const monthly = pricing && c ? deploymentHourly(pricing, c.provider, d) : undefined;
              return (
                <tr key={d.id} className={clsx("hover:bg-surface-2/60", d.status === "deleting" && "opacity-50")}>
                  <td className="td">
                    <div className="font-medium">{d.name}</div>
                    <div className="max-w-[260px] truncate font-mono text-xs text-ink-3">{d.model}</div>
                  </td>
                  <td className="td"><Pill>{engineById(d.engine).name} {d.engineVersion}</Pill></td>
                  <td className="td text-ink-2">{c?.name}<div className="text-xs text-ink-3">{d.namespace}</div></td>
                  <td className="td tnum text-ink-2">{d.gpusPerReplica}× {d.gpuType}<div className="text-xs text-ink-3">{d.readyReplicas}/{d.replicas.min}–{d.replicas.max} replicas</div></td>
                  <td className="td tnum text-right">{compact(d.live.tokensPerSec)} <span className="text-xs text-ink-3">tok/s</span></td>
                  <td className="td tnum text-right">{ms(d.live.ttftP95Ms)}</td>
                  <td className="td tnum text-right">{monthly !== undefined ? usd(monthly * HOURS_PER_MONTH) : "—"}</td>
                  <td className="td"><StatusBadge status={d.status} />{d.specVersion !== d.observedVersion && <div className="text-[11px] text-ink-3">v{d.specVersion} (agent at v{d.observedVersion})</div>}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      {d.promptCapture && <span title="Prompt capture on" className="p-1.5 text-ink-3"><Eye size={15} /></span>}
                      <button className="btn-ghost !p-1.5" aria-label="Edit" onClick={() => setEditing(d)} disabled={d.status === "deleting" || c?.agentMode === "observe"}
                        title={c?.agentMode === "observe" ? "Agent is in observe-only mode" : "Edit"}><Pencil size={15} /></button>
                      <button className="btn-ghost !p-1.5 hover:!text-critical-text" aria-label="Delete" onClick={() => setDeleting(d)} disabled={d.status === "deleting" || c?.agentMode === "observe"}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <DeploymentForm initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <DeleteDialog dep={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function DeploymentForm({ initial, onClose }: { initial?: Deployment; onClose: () => void }) {
  const { data: clusters = [] } = useClusters();
  const { data: pricing } = usePricing();
  const save = useSaveDeployment();
  const managed = clusters.filter((c) => c.agentMode === "manage");
  const [s, setS] = useState<DeploymentSpec>(() => initial ?? {
    name: "", model: "", engine: "vllm", engineVersion: ENGINES[0].versions[0], engineArgs: defaultArgs("vllm"),
    clusterId: managed[0]?.id ?? "", namespace: "llm-serving", gpuType: "A100-80G", gpusPerReplica: 1, replicas: { min: 1, max: 3 }, promptCapture: false,
  });
  const set = (p: Partial<DeploymentSpec>) => setS((x) => ({ ...x, ...p }));
  const pickEngine = (id: EngineId) => set({ engine: id, engineVersion: engineById(id).versions[0], engineArgs: defaultArgs(id) });
  const engine = engineById(s.engine);
  const cluster = clusters.find((c) => c.id === s.clusterId);
  const hourly = pricing && cluster ? deploymentHourly(pricing, cluster.provider, s) : undefined;
  const valid = s.name && s.model && s.clusterId && s.replicas.min <= s.replicas.max;

  const submit = () => save.mutate({ id: initial?.id, spec: s }, { onSuccess: onClose });

  return (
    <Drawer open onClose={onClose} title={initial ? `Edit ${initial.name}` : "Deploy a model"}
      footer={<>
        {save.error && <span className="mr-auto self-center text-xs text-critical-text">{(save.error as Error).message}</span>}
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!valid || save.isPending} onClick={submit}>{save.isPending ? "Saving…" : initial ? "Apply changes" : "Deploy"}</button>
      </>}>
      <div className="space-y-5">
        <div>
          <label className="label">Model (Hugging Face repo or registry path)</label>
          <input className="input font-mono" placeholder="meta-llama/Llama-3.1-8B-Instruct" value={s.model}
            onChange={(e) => set({ model: e.target.value, name: initial ? s.name : slug(e.target.value.split("/").pop() ?? "") })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Deployment name</label><input className="input" value={s.name} disabled={!!initial} onChange={(e) => set({ name: slug(e.target.value) })} /></div>
          <div><label className="label">Namespace</label><input className="input" value={s.namespace} onChange={(e) => set({ namespace: e.target.value })} /></div>
        </div>

        <div>
          <label className="label">Serving engine</label>
          <div className="grid grid-cols-2 gap-2">
            {ENGINES.map((e) => (
              <button key={e.id} type="button" onClick={() => pickEngine(e.id)}
                className={clsx("rounded-lg border p-3 text-left transition-colors", s.engine === e.id ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}>
                <div className="flex items-center justify-between text-sm font-medium">{e.name}{e.metrics === "native" && <Pill tone="accent">Full metrics</Pill>}</div>
                <div className="mt-0.5 text-xs text-ink-2">{e.tagline}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">{engine.name} settings</span>
            <select className="input !w-auto" value={s.engineVersion} onChange={(e) => set({ engineVersion: e.target.value })}>
              {engine.versions.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {engine.args.map((a) => {
              const v = s.engineArgs[a.key] ?? a.default;
              const upd = (val: string | number | boolean) => set({ engineArgs: { ...s.engineArgs, [a.key]: val } });
              return (
                <div key={a.key} className={a.type === "boolean" ? "flex items-center justify-between gap-2 self-end py-1.5" : ""}>
                  <label className={a.type === "boolean" ? "text-xs font-medium text-ink-2" : "label"}>{a.label}</label>
                  {a.type === "number" && <input type="number" className="input tnum" min={a.min} max={a.max} step={a.step} value={v as number} onChange={(e) => upd(Number(e.target.value))} />}
                  {a.type === "select" && <select className="input" value={v as string} onChange={(e) => upd(e.target.value)}>{a.options.map((o) => <option key={o}>{o}</option>)}</select>}
                  {a.type === "boolean" && <Toggle checked={v as boolean} onChange={upd} label={a.label} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Cluster</label>
            <select className="input" value={s.clusterId} onChange={(e) => set({ clusterId: e.target.value })}>
              {managed.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider})</option>)}
            </select>
          </div>
          <div>
            <label className="label">GPU</label>
            <select className="input" value={s.gpuType} onChange={(e) => set({ gpuType: e.target.value as DeploymentSpec["gpuType"] })}>
              {GPU_TYPES.map((g) => <option key={g} disabled={!cluster?.gpuInventory[g]}>{g}</option>)}
            </select>
          </div>
          <div><label className="label">GPUs per replica</label><input type="number" min={1} max={8} className="input tnum" value={s.gpusPerReplica} onChange={(e) => set({ gpusPerReplica: Number(e.target.value) })} /></div>
          <div>
            <label className="label">Replicas (min – max)</label>
            <div className="flex gap-2">
              <input type="number" min={0} className="input tnum" value={s.replicas.min} onChange={(e) => set({ replicas: { ...s.replicas, min: Number(e.target.value) } })} />
              <input type="number" min={1} className="input tnum" value={s.replicas.max} onChange={(e) => set({ replicas: { ...s.replicas, max: Number(e.target.value) } })} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-line p-3">
          <div>
            <div className="text-sm font-medium">Capture prompts & responses</div>
            <div className="text-xs text-ink-2">Sampled per org capture settings. Enables quality scoring & hallucination detection.</div>
          </div>
          <Toggle checked={s.promptCapture} onChange={(v) => set({ promptCapture: v })} label="Prompt capture" />
        </div>

        <div className="rounded-lg bg-surface-2 p-4 text-sm">
          <div className="text-xs text-ink-3">Estimated cost ({cluster?.provider.toUpperCase()}, on-demand, avg autoscale)</div>
          <div className="tnum mt-1 text-lg font-semibold">{hourly !== undefined ? `${usd(hourly * HOURS_PER_MONTH)} / mo` : "No price for this GPU on this provider"}</div>
          {hourly !== undefined && <div className="tnum text-xs text-ink-2">{usd(hourly, 2)} / hour</div>}
        </div>
      </div>
    </Drawer>
  );
}

function DeleteDialog({ dep, onClose }: { dep: Deployment | null; onClose: () => void }) {
  const del = useDeleteDeployment();
  const [typed, setTyped] = useState("");
  const close = () => { setTyped(""); del.reset(); onClose(); };
  if (!dep) return null;
  return (
    <Modal open onClose={close} title={`Delete ${dep.name}?`}>
      <p className="text-sm text-ink-2">The agent will scale this deployment to zero and remove its resources from <span className="font-mono">{dep.namespace}</span>. Traffic routed to it will fail.</p>
      <label className="label mt-4">Type <span className="font-mono text-ink">{dep.name}</span> to confirm</label>
      <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      {del.error && <p className="mt-2 text-xs text-critical-text">{(del.error as Error).message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-outline" onClick={close}>Cancel</button>
        <button className="btn-danger" disabled={typed !== dep.name || del.isPending} onClick={() => del.mutate(dep.id, { onSuccess: close })}>Delete</button>
      </div>
    </Modal>
  );
}
