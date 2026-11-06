import { useState } from "react";
import { useDeployments } from "@/api/hooks";
import { PageHeader, Segmented } from "@/components/ui";
import { GrafanaPanel, VLLM_PANELS, type PanelKey } from "@/components/GrafanaPanel";
import { engineById } from "@/lib/engines";

const RANGES = [{ id: "1h", label: "1h" }, { id: "6h", label: "6h" }, { id: "24h", label: "24h" }, { id: "7d", label: "7d" }] as const;

export default function Performance() {
  const { data: deps = [] } = useDeployments();
  const [dep, setDep] = useState("All");
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1h");
  const selected = deps.find((d) => d.name === dep);
  // Scale mock panels roughly to the deployment's size so they differ per selection.
  const scale = selected ? selected.live.tokensPerSec / 8000 : 1;
  const partial = selected && engineById(selected.engine).metrics === "partial";

  return (
    <>
      <PageHeader title="Performance" sub="vLLM / SGLang engine metrics scraped by the agent, rendered by Grafana." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="input !w-64" value={dep} onChange={(e) => setDep(e.target.value)}>
          <option value="All">All deployments</option>
          {deps.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <Segmented value={range} onChange={setRange} options={[...RANGES]} />
      </div>
      {partial && (
        <div className="mb-4 rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink-2">
          {engineById(selected!.engine).name} exposes a subset of these metrics. KV-cache and queue panels may be empty.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(Object.keys(VLLM_PANELS) as PanelKey[]).map((k) => (
          <GrafanaPanel key={k} panel={k} deployment={dep} range={range} scale={k === "throughput" || k === "running" ? scale : 1} />
        ))}
      </div>
    </>
  );
}
