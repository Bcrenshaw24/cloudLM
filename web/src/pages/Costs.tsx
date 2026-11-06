import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDeployments, usePricing } from "@/api/hooks";
import { PageHeader, Segmented, Stat } from "@/components/ui";
import { COMMITMENTS, HOURS_PER_MONTH, PROVIDERS, costPer1M, deploymentHourly, projectMonthly, type Commitment } from "@/lib/pricing";
import { compact, usd, usdCompact } from "@/lib/format";
import type { CloudProvider } from "@/types";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const MONTHS = ["Now", "+1", "+2", "+3", "+4", "+5", "+6", "+7", "+8", "+9", "+10", "+11"];

export default function Costs() {
  const { data: deps = [] } = useDeployments();
  const { data: pricing } = usePricing();
  const [provider, setProvider] = useState<CloudProvider>("aws");
  const [commit, setCommit] = useState<Commitment>("on_demand");
  const [growth, setGrowth] = useState(8);

  const projections = useMemo(() => {
    if (!pricing) return null;
    const byProv = Object.fromEntries(PROVIDERS.map((p) => [p.id, projectMonthly(pricing, p.id, deps, commit, growth / 100)]));
    const rows = MONTHS.map((m, i) => ({ m, ...Object.fromEntries(PROVIDERS.map((p) => [p.id, Math.round(byProv[p.id][i].cost)])) }));
    return { byProv, rows };
  }, [pricing, deps, commit, growth]);

  if (!pricing || !projections) return null;
  const sel = projections.byProv[provider];
  const annual = sel.reduce((a, x) => a + x.cost, 0);
  const unpriced = sel[0].unpriced;
  const cheapest = PROVIDERS.map((p) => ({ p, total: projections.byProv[p.id].reduce((a, x) => a + x.cost, 0), miss: projections.byProv[p.id][0].unpriced }))
    .filter((x) => x.miss === 0).sort((a, b) => a.total - b.total)[0];

  return (
    <>
      <PageHeader title="Cost projection" sub={`Fleet cost by cloud provider. Mock list prices as of ${pricing.updatedAt}.`} />

      <div className="card mb-6 flex flex-wrap items-end gap-5 p-4">
        <div><label className="label">Provider</label><Segmented value={provider} onChange={setProvider} options={PROVIDERS.map((p) => ({ id: p.id, label: p.name }))} /></div>
        <div><label className="label">Pricing</label><Segmented value={commit} onChange={setCommit} options={COMMITMENTS.map((c) => ({ id: c.id, label: c.label }))} /></div>
        <div className="w-56">
          <label className="label">Traffic growth: <span className="tnum text-ink">{growth}% / month</span></label>
          <input type="range" min={0} max={30} value={growth} onChange={(e) => setGrowth(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="This month" value={usdCompact(sel[0].cost)} sub={unpriced ? <span className="text-warning-text">{unpriced} deployment(s) use GPUs not offered here</span> : "Full fleet priced"} />
        <Stat label="Month 12" value={usdCompact(sel[11].cost)} sub={`at ${growth}% monthly growth`} />
        <Stat label="12-month total" value={usdCompact(annual)} />
        <Stat label="Cheapest full-fleet provider" value={cheapest?.p.name ?? "—"} sub={cheapest && `${usdCompact(cheapest.total)} over 12 months`} />
      </div>

      <div className="card mt-6 p-4">
        <div className="mb-2 text-sm font-medium">Projected monthly spend by provider</div>
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={projections.rows} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} tickFormatter={usdCompact} width={56} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "var(--text-3)" }} itemStyle={{ color: "var(--text)" }} formatter={(v: number, k: string) => [usd(v), PROVIDERS.find((p) => p.id === k)?.name]} labelFormatter={(m) => `Month ${m}`} />
              <Legend formatter={(k: string) => <span className="text-xs text-ink-2">{PROVIDERS.find((p) => p.id === k)?.name}</span>} iconType="plainline" />
              {PROVIDERS.map((p, i) => (
                <Line key={p.id} dataKey={p.id} stroke={SERIES[i]} dot={false} isAnimationActive={false}
                  strokeWidth={p.id === provider ? 2.5 : 1.5} strokeOpacity={p.id === provider ? 1 : 0.45} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-ink-3">Providers missing a GPU type exclude that deployment, so their line under-counts. Check the warning above.</p>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <div className="border-b border-line px-4 py-3 text-sm font-medium">Per deployment · {PROVIDERS.find((p) => p.id === provider)?.name}</div>
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-line"><tr>
            <th className="th">Deployment</th><th className="th">Hardware</th><th className="th text-right">Throughput</th>
            <th className="th text-right">$ / hour</th><th className="th text-right">$ / month</th><th className="th text-right">$ / 1M tokens</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {deps.map((d) => {
              const h = deploymentHourly(pricing, provider, d, commit);
              return (
                <tr key={d.id}>
                  <td className="td font-medium">{d.name}</td>
                  <td className="td tnum text-ink-2">{d.gpusPerReplica}× {d.gpuType}</td>
                  <td className="td tnum text-right">{compact(d.live.tokensPerSec)} tok/s</td>
                  <td className="td tnum text-right">{h !== undefined ? usd(h, 2) : <span className="text-ink-3">n/a</span>}</td>
                  <td className="td tnum text-right">{h !== undefined ? usd(h * HOURS_PER_MONTH) : "—"}</td>
                  <td className="td tnum text-right font-medium">{h !== undefined ? usd(costPer1M(h, d.live.tokensPerSec), 3) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
