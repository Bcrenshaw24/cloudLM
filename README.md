# CloudLM

LLM observability and deployment control plane for Kubernetes. A lightweight Go agent runs in the customer's cluster and pulls desired state from the CloudLM API. This repo currently has the **mock frontend**.

## Run the mock UI

```sh
cd web
npm install
npm run dev   # http://localhost:5173
```

All data comes from an in-browser mock control plane (`web/src/api/mock.ts`) persisted to localStorage. Use **Reset mock data** in the sidebar to restore the seed data.

## Pages

| Page | What it shows |
|---|---|
| Overview | Fleet KPIs, Grafana throughput and TTFT panels, agent health, running experiments |
| Deployments | Add, edit or delete models; choose the engine (vLLM, SGLang, TGI, TensorRT-LLM, Ollama, llama.cpp) with engine-specific args; live cost estimate |
| Performance | vLLM metrics dashboard (Grafana), filterable by deployment and time range |
| Cost projection | 12-month spend per cloud provider with commitment discounts and a traffic-growth slider; $/1M tokens per deployment |
| A/B experiments | Weighted traffic split between two deployments, metric comparison, significance test, promote the winner |
| Quality & traces | Opt-in prompt/response capture with an org consent gate, LLM-judge quality scores, hallucination flags, human review |

## Grafana

`GrafanaPanel` embeds `/grafana/d-solo/cloudlm-vllm/...` panels when a Grafana instance answers at `VITE_GRAFANA_URL` (dev proxies `/grafana` to `localhost:3000`). Otherwise it renders mocked series. For a real embed, Grafana needs `GF_SECURITY_ALLOW_EMBEDDING=true`, `GF_SERVER_SERVE_FROM_SUB_PATH=true`, and a dashboard with uid `cloudlm-vllm` whose panel ids match `VLLM_PANELS`.

## Layout

```
web/src/
  types.ts            domain model (mirrors the agent/API contract)
  api/                mock control plane + react-query hooks
  lib/                engine catalog, pricing math, formatters
  components/         UI kit, GrafanaPanel
  pages/              one file per page
```
