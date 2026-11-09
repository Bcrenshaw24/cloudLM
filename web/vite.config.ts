import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Grafana is served same-origin under /grafana (dev: proxied; prod: reverse proxy
// behind the app's auth). Same-origin keeps embedding, cookies and health checks simple.
// Local stack (deploy/docker-compose.local.yml): Grafana on :3001 (the engine owns :3000),
// and the Go agent (agent/local) on :8080, proxied under /agent so it needs no CORS.
const GRAFANA_TARGET = process.env.GRAFANA_TARGET ?? "http://127.0.0.1:3001";
const AGENT_TARGET = process.env.AGENT_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: '/cloudLM/',
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
        proxy: {
            // Grafana runs with serve_from_sub_path=true, so the /grafana prefix is kept.
            "/grafana": { target: GRAFANA_TARGET, changeOrigin: true, ws: true },
            "/agent": { target: AGENT_TARGET, changeOrigin: true, rewrite: (p) => p.replace(/^\/agent/, "") },
        },
    },
});
