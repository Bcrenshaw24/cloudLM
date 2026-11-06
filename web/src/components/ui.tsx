import { useEffect, type ReactNode } from "react";
import { X, CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw } from "lucide-react";
import clsx from "clsx";
import type { DeploymentStatus } from "@/types";

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="tnum mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

const STATUS: Record<DeploymentStatus, { label: string; icon: typeof CheckCircle2; cls: string; spin?: boolean }> = {
  running: { label: "Running", icon: CheckCircle2, cls: "text-good-text" },
  pending_sync: { label: "Awaiting agent", icon: RefreshCw, cls: "text-ink-2", spin: true },
  deploying: { label: "Deploying", icon: Loader2, cls: "text-accent", spin: true },
  degraded: { label: "Degraded", icon: AlertTriangle, cls: "text-warning-text" },
  failed: { label: "Failed", icon: XCircle, cls: "text-critical-text" },
  deleting: { label: "Deleting", icon: Loader2, cls: "text-ink-3", spin: true },
};

export function StatusBadge({ status }: { status: DeploymentStatus }) {
  const s = STATUS[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", s.cls)}>
      <s.icon size={14} className={clsx(s.spin && "animate-spin [animation-duration:2s]")} />
      {s.label}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warn" | "bad" }) {
  const t = {
    neutral: "bg-surface-2 text-ink-2",
    accent: "bg-accent-soft text-accent",
    good: "bg-good/12 text-good-text",
    warn: "bg-warning/15 text-warning-text",
    bad: "bg-critical/12 text-critical-text",
  }[tone];
  return <span className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="card relative w-full max-w-md p-5 shadow-2xl">
        <h2 className="mb-3 font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-3")}>
      <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={clsx("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", value === o.id ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) => (
  <div className="card flex flex-col items-center px-6 py-14 text-center">
    <div className="mb-3 text-ink-3">{icon}</div>
    <div className="font-medium">{title}</div>
    <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>
  </div>
);
