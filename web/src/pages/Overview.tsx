import { Link } from "react-router-dom";
import { useClusters, useDeployments, useExperiments, usePricing } from "@/api/hooks";
import { PageHeader, Pill, Stat, StatusBadge } from "@/components/ui";
import { GrafanaPanel } from "@/components/GrafanaPanel";
import { HOURS_PER_MONTH, deploymentHourly } from "@/lib/pricing";
import { ago, compact, ms, usdCompact } from "@/lib/format";

export default function Overview() {
  const { data: deps = [] } = useDeployments();
  const { data: clusters = [] } = useClusters();
  const { data: exps = [] } = useExperiments();
  const { data: pricing } = usePricing();

  const tps = deps.reduce((a, d) => a + d.live.tokensPerSec, 0);
  const rps = deps.reduce((a, d) => a + d.live.requestsPerSec, 0);
  const worstTtft = Math.max(0, ...deps.map((d) => d.live.ttftP95Ms));
  const monthly = pricing
    ? deps.reduce((a, d) => {
        const c = clusters.find((x) => x.id === d.clusterId);
        return a + (c ? (deploymentHourly(pricing, c.provider, d) ?? 0) * HOURS_PER_MONTH : 0);
      }, 0)
    : 0;
  const unhealthy = deps.filter((d) => d.status === "degraded" || d.status === "failed");

  return (
    <>
      <PageHeader title="Overview" sub="All clusters · last hour" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active deployments" value={deps.length} sub={unhealthy.length ? <span className="text-warning-text">{unhealthy.length} need attention</span> : "All healthy"} />
        <Stat label="Requests / sec" value={rps.toFixed(1)} sub={`${compact(tps)} tokens/sec generated`} />
        <Stat label="Worst TTFT p95" value={ms(worstTtft)} sub={deps.find((d) => d.live.ttftP95Ms === worstTtft)?.name} />
        <Stat label="Projected spend / month" value={usdCompact(monthly)} sub="On-demand list price" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GrafanaPanel panel="throughput" />
        <GrafanaPanel panel="ttft" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-medium">Deployments</span>
            <Link to="/deployments" className="text-xs text-accent hover:underline">Manage →</Link>
          </div>
          <ul className="divide-y divide-line">
            {deps.map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{d.name}</div></div>
                <span className="tnum hidden w-24 text-right text-ink-2 sm:block">{compact(d.live.tokensPerSec)} tok/s</span>
                <span className="w-28"><StatusBadge status={d.status} /></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div className="card">
            <div className="border-b border-line px-4 py-3 text-sm font-medium">Agents</div>
            <ul className="divide-y divide-line">
              {clusters.map((c) => (
                <li key={c.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between"><span className="font-medium">{c.name}</span><Pill tone={c.agentMode === "manage" ? "accent" : "neutral"}>{c.agentMode}</Pill></div>
                  <div className="mt-0.5 text-xs text-ink-3">{c.provider.toUpperCase()} · {c.region} · v{c.agentVersion} · seen {ago(c.lastSeen)}</div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-medium">Running experiments</span>
              <Link to="/experiments" className="text-xs text-accent hover:underline">View →</Link>
            </div>
            <ul className="divide-y divide-line">
              {exps.filter((e) => e.status === "running").map((e) => (
                <li key={e.id}><Link to={`/experiments/${e.id}`} className="block px-4 py-2.5 text-sm hover:bg-surface-2">{e.name}</Link></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
