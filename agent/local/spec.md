# API Specs

## Runtime Contract 

| Variable | Value on the benchmark box |
|---|---|
| `LLM_PATH` | path to a currently running LLM |
| `ENGINE` | `vLLM`, `llama.cpp` |
| `HOST`, `PORT` | `127.0.0.1`, `3000`|

## Endpoints Engine -> Agent

| Request | Success | Body |
|---|---|---|
| `GET /metrics` | 200 | `text/plain` |

vLLM and llama.cpp return plain text responses formatted for prometheus use. 

## Endpoints Agent -> Server

| Request | Success | Body |
|---|---|---|
| `GET /metrics/HOST:PORT` | 200 | `{"status":"success", "data": {"resultType": "matrix", "result": [{ {"metric": {"__name__": <string>, "model_name": <string>}, "values": <array>,array> }}]}}` |