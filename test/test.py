import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from huggingface_hub import hf_hub_download
from llama_cpp import Llama

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "3000"))

model_local_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Qwen2.5-7B-Instruct-Q4_K_M.gguf")
MODEL = os.path.basename(model_local_path)
llm = Llama(
    model_path=model_local_path,
    n_gpu_layers=0,
    n_ctx=2048,
    n_threads=8,
    verbose=False
)

# Llama isn't thread-safe: one generation at a time, others wait (shows up as "deferred").
GEN_LOCK = threading.Lock()
STATS_LOCK = threading.Lock()
S = {
    "prompt_tokens": 0, "predicted_tokens": 0,
    "prompt_seconds": 0.0, "predicted_seconds": 0.0,
    "requests_processing": 0, "requests_deferred": 0, "n_decode": 0,
}


def generate(prompt, max_tokens):
    with STATS_LOCK:
        S["requests_deferred"] += 1
    with GEN_LOCK:
        with STATS_LOCK:
            S["requests_deferred"] -= 1
            S["requests_processing"] += 1
        t0 = time.time()
        try:
            out = llm(prompt, max_tokens=max_tokens)
        finally:
            dt = time.time() - t0
            with STATS_LOCK:
                S["requests_processing"] -= 1
        u = out["usage"]
        with STATS_LOCK:
            S["prompt_tokens"] += u["prompt_tokens"]
            S["predicted_tokens"] += u["completion_tokens"]
            # llama-cpp-python doesn't split prefill/decode time; attribute all of it to decode.
            S["predicted_seconds"] += dt
            S["n_decode"] += u["completion_tokens"]
    return out


def render_metrics():
    with STATS_LOCK:
        s = dict(S)
    rows = [
        ("prompt_tokens_total", "counter", "Number of prompt tokens processed.", s["prompt_tokens"]),
        ("prompt_seconds_total", "counter", "Prompt process time.", s["prompt_seconds"]),
        ("tokens_predicted_total", "counter", "Number of generation tokens processed.", s["predicted_tokens"]),
        ("tokens_predicted_seconds_total", "counter", "Predict process time.", s["predicted_seconds"]),
        ("n_decode_total", "counter", "Total number of llama_decode() calls.", s["n_decode"]),
        ("requests_processing", "gauge", "Number of requests processing.", s["requests_processing"]),
        ("requests_deferred", "gauge", "Number of requests deferred.", s["requests_deferred"]),
    ]
    out = []
    for name, kind, help_, val in rows:
        out += [f"# HELP llamacpp:{name} {help_}", f"# TYPE llamacpp:{name} {kind}",
                f'llamacpp:{name}{{model_name="{MODEL}"}} {val}']
    return "\n".join(out) + "\n"


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/metrics":
            self._send(200, render_metrics(), "text/plain; version=0.0.4; charset=utf-8")
        elif path == "/health":
            self._send(200, json.dumps({"status": "ok"}))
        elif path == "/v1/models":
            self._send(200, json.dumps({"object": "list", "data": [{"id": MODEL, "object": "model"}]}))
        else:
            self._send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/v1/completions", "/completion"):
            return self._send(404, json.dumps({"error": "not found"}))
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        out = generate(body.get("prompt", ""), int(body.get("max_tokens", 32)))
        self._send(200, json.dumps(out))

    def log_message(self, fmt, *args):
        print(f"[{MODEL}] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"serving {MODEL} on http://{HOST}:{PORT}  (GET /metrics, POST /v1/completions)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
