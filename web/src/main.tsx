import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Activity, Boxes, DollarSign, FlaskConical, LayoutDashboard, MessageSquareText, Moon, Sun, RotateCcw } from "lucide-react";
import clsx from "clsx";
import "./index.css";
import { api } from "./api/mock";
import Overview from "./pages/Overview";
import Deployments from "./pages/Deployments";
import Performance from "./pages/Performance";
import Costs from "./pages/Costs";
import Experiments from "./pages/Experiments";
import Quality from "./pages/Quality";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/deployments", label: "Deployments", icon: Boxes },
  { to: "/performance", label: "Performance", icon: Activity },
  { to: "/costs", label: "Cost projection", icon: DollarSign },
  { to: "/experiments", label: "A/B experiments", icon: FlaskConical },
  { to: "/quality", label: "Quality & traces", icon: MessageSquareText },
];

function ThemeToggle() {
  const isDark = () =>
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const [dark, setDark] = useState(isDark);
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cloudlm.theme", next); } catch { /* ignore */ }
    setDark(!dark);
  };
  return (
    <button className="btn-ghost w-full" onClick={flip}>
      {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}

function Shell() {
  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg">C</div>
          <span className="font-semibold tracking-tight">CloudLM</span>
          <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-3">MOCK</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                isActive ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
              <n.icon size={16} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-line p-3">
          <ThemeToggle />
          <button className="btn-ghost w-full" onClick={() => { api.reset(); location.reload(); }}>
            <RotateCcw size={16} /> Reset mock data
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => clsx("shrink-0 rounded-md px-2.5 py-1.5 text-xs", isActive ? "bg-accent-soft text-accent" : "text-ink-2")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/deployments" element={<Deployments />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/costs" element={<Costs />} />
              <Route path="/experiments" element={<Experiments />} />
              <Route path="/experiments/:id" element={<Experiments />} />
              <Route path="/quality" element={<Quality />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
