package plugin

import (
	"testing"
)

func TestParseInstalledLicenseFile(t *testing.T) {
	got, ok := parseInstalledLicenseFile([]byte(`{"licenseKey":" LUM-1 ","licenseApiUrl":" https://loja.example/api/license/validate ","grafanaIp":"203.0.113.10"}`))
	if !ok {
		t.Fatal("esperava licença")
	}
	if got.LicenseKey != "LUM-1" || got.LicenseAPIURL != "https://loja.example/api/license/validate" || got.GrafanaIP != "203.0.113.10" {
		t.Fatalf("parse: %+v", got)
	}
	if _, ok := parseInstalledLicenseFile([]byte(`{}`)); ok {
		t.Fatal("arquivo vazio não é licença")
	}
}

func TestLicenseStatusURL(t *testing.T) {
	if got := licenseStatusURL("https://loja.example/api/license/validate"); got != "https://loja.example/api/license/status" {
		t.Fatalf("status url: %s", got)
	}
}

func TestIsAllowedLicenseAPIURL(t *testing.T) {
	if !isAllowedLicenseAPIURL("https://loja.example/api/license/validate") {
		t.Fatal("https válido")
	}
	if isAllowedLicenseAPIURL("javascript:alert(1)") {
		t.Fatal("javascript não é URL da loja")
	}
}

func TestMatchAuthorizedGrafanaIP(t *testing.T) {
	if got := matchAuthorizedGrafanaIP("203.0.113.10", []string{"10.0.0.1", "203.0.113.10"}); got != "203.0.113.10" {
		t.Fatalf("match: %s", got)
	}
	if got := matchAuthorizedGrafanaIP("203.0.113.10", []string{"10.0.0.1"}); got != "" {
		t.Fatalf("não deveria casar: %s", got)
	}
	if got := resolveGrafanaServerIP("grafana.example", "198.51.100.9"); got != "198.51.100.9" {
		t.Fatalf("host nomeado usa IP gravado: %s", got)
	}
	if got := resolveGrafanaServerIP("198.51.100.8", "203.0.113.10"); got != "198.51.100.8" {
		t.Fatalf("host IPv4 prevalece: %s", got)
	}
}
