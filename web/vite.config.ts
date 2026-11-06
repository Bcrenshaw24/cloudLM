import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Grafana is served same-origin under /grafana (dev: proxied; prod: reverse proxy
// behind the app's auth). Same-origin keeps embedding, cookies and health checks simple.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      port: 5173,
      proxy: {
        "/grafana": { target: env.GRAFANA_UPSTREAM ?? "http://localhost:3000", changeOrigin: true, ws: true },
      },
    },
  };
});
