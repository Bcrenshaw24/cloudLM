package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

var client = &http.Client{Timeout: 5 * time.Second}

// Matrix response shape from specs.md (Agent -> Server).
type matrixResponse struct {
	Status string     `json:"status"`
	Data   matrixData `json:"data"`
}

type matrixData struct {
	ResultType string         `json:"resultType"`
	Result     []matrixSeries `json:"result"`
}

type matrixSeries struct {
	Metric map[string]string `json:"metric"`
	Values [][2]any          `json:"values"` // [unix_ts, "value"]
}

// scrape does GET http://target/metrics against the engine.
func scrape(target string) ([]Sample, error) {
	resp, err := client.Get("http://" + target + "/metrics")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("engine returned %s", resp.Status)
	}
	return parseProm(resp.Body)
}

func toMatrix(samples []Sample, now time.Time) matrixResponse {
	ts := float64(now.UnixMilli()) / 1000
	res := make([]matrixSeries, 0, len(samples))
	for _, s := range samples {
		m := map[string]string{"__name__": s.Name}
		for k, v := range s.Labels {
			m[k] = v
		}
		res = append(res, matrixSeries{Metric: m, Values: [][2]any{{ts, s.Value}}})
	}
	return matrixResponse{Status: "success", Data: matrixData{ResultType: "matrix", Result: res}}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func newMux(cfg Config) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /metrics/{target}", func(w http.ResponseWriter, r *http.Request) {
		target := r.PathValue("target")
		// Only the configured engine may be scraped; otherwise this is an open SSRF proxy.
		if target != cfg.Target() {
			writeJSON(w, http.StatusNotFound, map[string]string{"status": "error", "error": "unknown target"})
			return
		}
		samples, err := scrape(target)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"status": "error", "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, toMatrix(samples, time.Now()))
	})

	return mux
}

func main() {
	cfg := loadConfig()
	addr := fmt.Sprintf("%s:%s", cfg.AgentHost, cfg.AgentPort)
	log.Printf("agent listening on %s, engine=%s target=%s", addr, cfg.Engine, cfg.Target())
	log.Fatal(http.ListenAndServe(addr, newMux(cfg)))
}
