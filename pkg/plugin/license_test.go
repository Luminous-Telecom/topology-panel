package plugin

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestLicenseCheckerAcceptsSignedTicket(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pemText := publicPEM(t, key)
	dir := t.TempDir()
	store := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/license/status":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"authorizedIps": []string{"203.0.113.10"},
				"pluginId":      ID,
				"pluginVersion": "1.9.0",
			})
		case r.Method == http.MethodPost && r.URL.Path == "/api/license/validate":
			now := time.Now()
			ticket := signTestTicket(t, key, ticketClaims{
				PluginID: ID,
				IP:       "203.0.113.10",
				KeyHash:  licenseKeyHash("LUM-TEST"),
				RegisteredClaims: jwt.RegisteredClaims{
					Issuer:    ticketIssuer,
					Audience:  jwt.ClaimStrings{ID},
					ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
					IssuedAt:  jwt.NewNumericDate(now),
				},
			})
			_ = json.NewEncoder(w).Encode(map[string]any{
				"valid":         true,
				"pluginId":      ID,
				"pluginVersion": "1.9.0",
				"ticket":        ticket,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer store.Close()

	if err := os.WriteFile(filepath.Join(dir, "license.json"), []byte(`{
		"licenseKey":"LUM-TEST",
		"licenseApiUrl":"`+store.URL+`/api/license/validate",
		"grafanaIp":"203.0.113.10"
	}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "plugin.json"), []byte(`{"info":{"version":"1.4.398"}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	checker := newLicenseChecker(dir, store.Client(), "1.4.398")
	checker.verify = func(ticket, licenseKey, ip, pluginID string) bool {
		return verifyLicenseTicket(ticket, licenseKey, ip, pluginID, pemText)
	}
	got := checker.check("203.0.113.10")
	if !got.Valid || got.StoreVersion != "1.9.0" || got.GrafanaIP != "203.0.113.10" {
		t.Fatalf("licença: %+v", got)
	}
}

func TestHandlerSnapshotRequiresLicense(t *testing.T) {
	dir := t.TempDir()
	h := New(dir)
	req := httptest.NewRequest(http.MethodGet, "/snapshot?key=YQ", nil)
	rec := httptest.NewRecorder()
	h.handleSnapshot(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sem licença: %d %s", rec.Code, rec.Body.String())
	}
}

func TestHandlerLicenseMissingFile(t *testing.T) {
	h := New(t.TempDir())
	req := httptest.NewRequest(http.MethodGet, "/license", nil)
	rec := httptest.NewRecorder()
	h.handleLicense(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status: %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Body)
	var parsed LicenseResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.Valid || parsed.Message == "" {
		t.Fatalf("esperava bloqueio: %+v", parsed)
	}
}
