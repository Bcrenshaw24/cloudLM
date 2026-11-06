import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Grafana is served same-origin under /grafana (dev: proxied; prod: reverse proxy
// behind the app's auth). Same-origin keeps embedding, cookies and health checks simple.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: '/cloudLM/',
    resolve: { alias: { "@": path.resolve(__dirname, "src") } }
});
