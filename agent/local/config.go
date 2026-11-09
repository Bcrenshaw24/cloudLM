package main

import (
	"net"
	"os"
)

// Config is the runtime contract from specs.md plus the agent's own listen address.
type Config struct {
	Engine    string // vLLM | llama.cpp
	Host      string // engine host
	Port      string // engine port
	LLMPath   string
	AgentHost string // address the agent listens on (0.0.0.0 so the container port is reachable)
	AgentPort string
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func loadConfig() Config {
	return Config{
		Engine:    env("ENGINE", "vLLM"),
		Host:      env("HOST", "127.0.0.1"),
		Port:      env("PORT", "3000"),
		LLMPath:   os.Getenv("LLM_PATH"),
		AgentHost: env("AGENT_HOST", "0.0.0.0"),
		AgentPort: env("AGENT_PORT", "8080"),
	}
}

// Target is the engine's HOST:PORT.
func (c Config) Target() string { return net.JoinHostPort(c.Host, c.Port) }
