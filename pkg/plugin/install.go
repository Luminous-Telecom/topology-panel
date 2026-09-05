package plugin

import (
	"encoding/json"
	"net"
	"net/url"
	"strings"
)

type installedLicense struct {
	LicenseKey    string
	LicenseAPIURL string
	GrafanaIP     string
}

func parseInstalledLicenseFile(raw []byte) (installedLicense, bool) {
	var rec struct {
		LicenseKey    string `json:"licenseKey"`
		LicenseAPIURL string `json:"licenseApiUrl"`
		GrafanaIP     string `json:"grafanaIp"`
	}
	if err := json.Unmarshal(raw, &rec); err != nil {
		return installedLicense{}, false
	}
	key := strings.TrimSpace(rec.LicenseKey)
	apiURL := strings.TrimSpace(rec.LicenseAPIURL)
	if key == "" || apiURL == "" {
		return installedLicense{}, false
	}
	out := installedLicense{LicenseKey: key, LicenseAPIURL: apiURL}
	ip := strings.TrimSpace(rec.GrafanaIP)
	if isIPv4(ip) {
		out.GrafanaIP = ip
	}
	return out, true
}

func isAllowedLicenseAPIURL(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" {
		return false
	}
	return parsed.Scheme == "http" || parsed.Scheme == "https"
}

func licenseStatusURL(validateURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(validateURL), "/")
	if strings.HasSuffix(trimmed, "/validate") {
		return trimmed[:len(trimmed)-len("/validate")] + "/status"
	}
	return trimmed + "/status"
}

func isIPv4(value string) bool {
	ip := net.ParseIP(strings.TrimSpace(value))
	return ip != nil && ip.To4() != nil
}

func isLocalDevelopmentHost(host string) bool {
	switch strings.TrimSpace(strings.ToLower(host)) {
	case "localhost", "127.0.0.1", "::1", "[::1]":
		return true
	default:
		return false
	}
}

func resolveGrafanaServerIP(pageHostname, installedGrafanaIP string) string {
	host := strings.TrimSpace(pageHostname)
	if isIPv4(host) {
		return host
	}
	installed := strings.TrimSpace(installedGrafanaIP)
	if isIPv4(installed) {
		return installed
	}
	return lookupHostnameIPv4(host)
}

func lookupHostnameIPv4(host string) string {
	if host == "" || isLocalDevelopmentHost(host) {
		return ""
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return ""
	}
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil && !v4.IsLoopback() {
			return v4.String()
		}
	}
	return ""
}

func matchAuthorizedGrafanaIP(grafanaIP string, authorized []string) string {
	if !isIPv4(grafanaIP) {
		return ""
	}
	for _, ip := range authorized {
		if strings.TrimSpace(ip) == grafanaIP {
			return grafanaIP
		}
	}
	return ""
}

func licenseRejectMessage(reason string) string {
	switch reason {
	case "not_found":
		return "Licença não encontrada. Rode de novo o comando de instalação da loja."
	case "ip_not_authorized":
		return "IP não autorizado. Cadastre o IP deste Grafana em Minha conta na loja."
	case "expired":
		return "Licença expirada."
	case "status_pending":
		return "Licença ainda não está ativa. Conclua o pagamento na loja."
	case "status_suspended":
		return "Licença suspensa. Fale com o suporte da loja."
	case "status_cancelled":
		return "Licença cancelada."
	case "invalid_payload":
		return "A loja recusou o pedido de validação. Cadastre o IP em Minha conta na loja."
	default:
		return "Licença inválida. Confira a instalação e o IP em Minha conta na loja."
	}
}
