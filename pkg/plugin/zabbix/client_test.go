package zabbix

import (
	"net/http"
	"testing"
)

func TestIdentityHeadersFromRequestForwardsGrafanaSession(t *testing.T) {
	src := http.Header{}
	src["cookie"] = []string{"grafana_session=abc"}
	src["X-Grafana-Id"] = []string{"eyJhbGciOiJIUzI1NiJ9.e30.sig"}
	src["http_Authorization"] = []string{"Bearer token"}
	got := identityHeadersFromRequest(src, 1)
	if got.Get("Cookie") != "grafana_session=abc" {
		t.Fatalf("Cookie=%q", got.Get("Cookie"))
	}
	if got.Get("X-Grafana-Id") == "" {
		t.Fatal("faltou X-Grafana-Id")
	}
	if got.Get("Authorization") != "Bearer token" {
		t.Fatalf("Authorization=%q", got.Get("Authorization"))
	}
	if got.Get("X-Grafana-Org-Id") != "1" {
		t.Fatalf("org=%q", got.Get("X-Grafana-Org-Id"))
	}
}

func TestIdentityHeadersFromRequestIgnoresUnrelatedHeaders(t *testing.T) {
	src := http.Header{}
	src.Set("Content-Type", "application/json")
	src.Set("X-Forwarded-For", "10.0.0.1")
	got := identityHeadersFromRequest(src, 0)
	if got.Get("Content-Type") != "" || got.Get("X-Forwarded-For") != "" {
		t.Fatalf("headers inesperados: %v", got)
	}
}
