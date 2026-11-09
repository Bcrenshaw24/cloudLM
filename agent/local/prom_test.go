package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const sample = `# HELP vllm:num_requests_running Running
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running{engine="0",model_name="meta/llama \"x\""} 3.0
vllm:e2e_request_latency_seconds_bucket{le="+Inf",model_name="m"} 12
plain_metric 1.5 1700000000
bad line here
`

func TestParseProm(t *testing.T) {
	got, err := parseProm(strings.NewReader(sample))
	if err != nil || len(got) != 3 {
		t.Fatalf("err=%v len=%d", err, len(got))
	}
	if got[0].Labels["model_name"] != `meta/llama "x"` || got[0].Value != "3.0" {
		t.Fatalf("bad sample %+v", got[0])
	}
	if got[2].Name != "plain_metric" || got[2].Value != "1.5" {
		t.Fatalf("bad sample %+v", got[2])
	}
}

func TestEndpoint(t *testing.T) {
	eng := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/metrics" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte(sample))
	}))
	defer eng.Close()
	host, port, _ := strings.Cut(strings.TrimPrefix(eng.URL, "http://"), ":")
	cfg := Config{Host: host, Port: port}
	agent := httptest.NewServer(newMux(cfg))
	defer agent.Close()

	resp, _ := http.Get(agent.URL + "/metrics/" + cfg.Target())
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	resp, _ = http.Get(agent.URL + "/metrics/evil.com:80")
	if resp.StatusCode != 404 {
		t.Fatalf("expected 404 for foreign target, got %d", resp.StatusCode)
	}
}
