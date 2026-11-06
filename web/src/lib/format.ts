export const usd = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });

export const usdCompact = (n: number) =>
  n >= 1000 ? "$" + (n / 1000).toLocaleString("en-US", { maximumFractionDigits: n >= 100_000 ? 0 : 1 }) + "k" : usd(n);

export const num = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const compact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const pct = (n: number, digits = 1) => (n * 100).toFixed(digits) + "%";

export const ms = (n: number) => (n >= 1000 ? (n / 1000).toFixed(2) + " s" : Math.round(n) + " ms");

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52);
