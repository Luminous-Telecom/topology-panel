package plugin

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	storeTimeout = 15 * time.Second
	// Curto de propósito: tirar o IP na loja tem que valer sem reiniciar o Grafana.
	licenseCacheTTL = 30 * time.Second
)

type LicenseResponse struct {
	Valid        bool   `json:"valid"`
	Message      string `json:"message,omitempty"`
	Retryable    bool   `json:"retryable,omitempty"`
	StoreVersion string `json:"storeVersion,omitempty"`
	GrafanaIP    string `json:"grafanaIp,omitempty"`
}

type licenseChecker struct {
	dir      string
	client   *http.Client
	pluginID string
	version  string
	verify   func(ticket, licenseKey, ip, pluginID string) bool
	now      func() time.Time

	mu          sync.Mutex
	cached      LicenseResponse
	cachedUntil time.Time
	cachedStamp string
}

func newLicenseChecker(dir string, client *http.Client, version string) *licenseChecker {
	if client == nil {
		client = &http.Client{Timeout: storeTimeout}
	}
	return &licenseChecker{
		dir:      dir,
		client:   client,
		pluginID: ID,
		version:  version,
		verify: func(ticket, licenseKey, ip, pluginID string) bool {
			return verifyLicenseTicket(ticket, licenseKey, ip, pluginID, ticketPublicPEM)
		},
		now: time.Now,
	}
}

func (c *licenseChecker) check(pageHost string) LicenseResponse {
	file, ok := c.readInstall()
	if !ok {
		return LicenseResponse{
			Message: "Rode o comando de instalação da loja neste Grafana. A chave e a URL são gravadas na instalação.",
		}
	}
	if !isAllowedLicenseAPIURL(file.LicenseAPIURL) {
		return LicenseResponse{
			Message: "Rode o comando de instalação da loja neste Grafana. A URL da loja é gravada na instalação.",
		}
	}
	grafanaIP := resolveGrafanaServerIP(pageHost, file.GrafanaIP)
	stamp := file.LicenseKey + "\x00" + file.LicenseAPIURL + "\x00" + grafanaIP + "\x00" + c.version

	c.mu.Lock()
	if c.cachedStamp == stamp && c.now().Before(c.cachedUntil) {
		cached := c.cached
		c.mu.Unlock()
		return cached
	}
	c.mu.Unlock()

	result := c.validateAgainstStore(file, grafanaIP)
	if result.Valid || !result.Retryable {
		c.mu.Lock()
		c.cached = result
		c.cachedStamp = stamp
		c.cachedUntil = c.now().Add(licenseCacheTTL)
		c.mu.Unlock()
	}
	return result
}

func (c *licenseChecker) readInstall() (installedLicense, bool) {
	raw, err := os.ReadFile(filepath.Join(c.dir, "license.json"))
	if err != nil {
		return installedLicense{}, false
	}
	return parseInstalledLicenseFile(raw)
}

func (c *licenseChecker) validateAgainstStore(file installedLicense, grafanaIP string) LicenseResponse {
	status, err := c.fetchStatus(file)
	if err != nil {
		return LicenseResponse{
			Message:   "Não foi possível consultar a loja. Confira a rede deste Grafana.",
			Retryable: true,
		}
	}
	if !status.ok {
		return LicenseResponse{Message: status.message, Retryable: status.retryable}
	}
	if status.pluginID != "" && status.pluginID != c.pluginID {
		return LicenseResponse{Message: "Esta chave não é do Topology Panel."}
	}
	ip := matchAuthorizedGrafanaIP(grafanaIP, status.authorizedIPs)
	if ip == "" {
		if grafanaIP != "" {
			return LicenseResponse{
				GrafanaIP: grafanaIP,
				Message:   "O IP deste Grafana (" + grafanaIP + ") não está na licença. Cadastre esse IP em Minha conta.",
			}
		}
		return LicenseResponse{Message: "Cadastre o IP deste servidor Grafana em Minha conta na loja."}
	}
	validation, err := c.fetchValidate(file, ip)
	if err != nil {
		return LicenseResponse{
			GrafanaIP: ip,
			Message:   "Não foi possível validar a licença. Confira a URL da loja e a rede deste Grafana.",
			Retryable: true,
		}
	}
	validation.GrafanaIP = ip
	return validation
}

type storeStatus struct {
	ok            bool
	retryable     bool
	message       string
	authorizedIPs []string
	storeVersion  string
	pluginID      string
}

func (c *licenseChecker) fetchStatus(file installedLicense) (storeStatus, error) {
	req, err := http.NewRequest(http.MethodGet, licenseStatusURL(file.LicenseAPIURL), nil)
	if err != nil {
		return storeStatus{}, err
	}
	req.Header.Set("X-License-Key", file.LicenseKey)
	resp, err := c.client.Do(req)
	if err != nil {
		return storeStatus{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := "A loja não pôde consultar a licença agora. Tente de novo em instantes."
		if resp.StatusCode == http.StatusUnauthorized {
			message = "Licença inválida. Rode de novo o comando de instalação da loja."
		}
		return storeStatus{retryable: resp.StatusCode >= 500, message: message}, nil
	}
	var parsed struct {
		AuthorizedIPs []string `json:"authorizedIps"`
		PluginVersion string   `json:"pluginVersion"`
		PluginID      string   `json:"pluginId"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return storeStatus{message: "A loja não pôde consultar a licença agora. Tente de novo em instantes.", retryable: true}, nil
	}
	return storeStatus{
		ok:            true,
		authorizedIPs: parsed.AuthorizedIPs,
		storeVersion:  parsed.PluginVersion,
		pluginID:      parsed.PluginID,
	}, nil
}

func (c *licenseChecker) fetchValidate(file installedLicense, ip string) (LicenseResponse, error) {
	payload, err := json.Marshal(map[string]string{
		"licenseKey":    file.LicenseKey,
		"ip":            ip,
		"pluginVersion": c.version,
	})
	if err != nil {
		return LicenseResponse{}, err
	}
	req, err := http.NewRequest(http.MethodPost, file.LicenseAPIURL, bytes.NewReader(payload))
	if err != nil {
		return LicenseResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return LicenseResponse{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return LicenseResponse{
			Message:   "A loja não pôde validar a licença agora. Tente de novo em instantes.",
			Retryable: resp.StatusCode >= 500,
		}, nil
	}
	var parsed struct {
		Valid         bool    `json:"valid"`
		Reason        *string `json:"reason"`
		PluginID      *string `json:"pluginId"`
		PluginVersion *string `json:"pluginVersion"`
		Ticket        *string `json:"ticket"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return LicenseResponse{Message: licenseRejectMessage(""), Retryable: true}, nil
	}
	if parsed.Valid {
		if parsed.PluginID != nil && *parsed.PluginID != "" && *parsed.PluginID != c.pluginID {
			return LicenseResponse{Message: "Esta chave não é do Topology Panel."}, nil
		}
		ticket := ""
		if parsed.Ticket != nil {
			ticket = *parsed.Ticket
		}
		if !c.verify(ticket, file.LicenseKey, ip, c.pluginID) {
			return LicenseResponse{Message: "A loja não assinou esta licença. Confira a instalação e a URL da loja."}, nil
		}
		storeVersion := ""
		if parsed.PluginVersion != nil {
			storeVersion = *parsed.PluginVersion
		}
		return LicenseResponse{Valid: true, StoreVersion: storeVersion}, nil
	}
	reason := ""
	if parsed.Reason != nil {
		reason = *parsed.Reason
	}
	return LicenseResponse{Message: licenseRejectMessage(reason)}, nil
}
