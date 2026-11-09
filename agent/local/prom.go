package main

import (
	"bufio"
	"io"
	"strconv"
	"strings"
)

// Sample is one line of Prometheus text exposition.
type Sample struct {
	Name   string
	Labels map[string]string
	Value  string
}

// parseProm parses Prometheus text format (as served by vLLM and llama.cpp).
// Comment lines and unparseable lines are skipped.
func parseProm(r io.Reader) ([]Sample, error) {
	var out []Sample
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || line[0] == '#' {
			continue
		}
		if s, ok := parseLine(line); ok {
			out = append(out, s)
		}
	}
	return out, sc.Err()
}

func parseLine(line string) (Sample, bool) {
	s := Sample{Labels: map[string]string{}}
	rest := line
	if i := strings.IndexAny(line, "{ "); i < 0 {
		return s, false
	} else {
		s.Name = line[:i]
		rest = line[i:]
	}
	if rest[0] == '{' {
		end, ok := parseLabels(rest, s.Labels)
		if !ok {
			return s, false
		}
		rest = rest[end:]
	}
	fields := strings.Fields(rest) // value [timestamp]
	if len(fields) == 0 {
		return s, false
	}
	if _, err := strconv.ParseFloat(fields[0], 64); err != nil {
		return s, false
	}
	s.Value = fields[0]
	return s, true
}

// parseLabels reads `{k="v",...}` from the start of s and returns the index after '}'.
func parseLabels(s string, into map[string]string) (int, bool) {
	i := 1
	for i < len(s) {
		for i < len(s) && (s[i] == ',' || s[i] == ' ') {
			i++
		}
		if i < len(s) && s[i] == '}' {
			return i + 1, true
		}
		eq := strings.IndexByte(s[i:], '=')
		if eq < 0 || i+eq+1 >= len(s) || s[i+eq+1] != '"' {
			return 0, false
		}
		key := s[i : i+eq]
		i += eq + 2
		var val strings.Builder
		for i < len(s) && s[i] != '"' {
			if s[i] == '\\' && i+1 < len(s) {
				i++
				switch s[i] {
				case 'n':
					val.WriteByte('\n')
				default:
					val.WriteByte(s[i])
				}
			} else {
				val.WriteByte(s[i])
			}
			i++
		}
		if i >= len(s) {
			return 0, false
		}
		i++ // closing quote
		into[key] = val.String()
	}
	return 0, false
}
