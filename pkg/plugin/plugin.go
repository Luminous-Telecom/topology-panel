package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

const ID = "luminous-topology-panel"

type Handler struct {
	licenses  *licenseChecker
	resources backend.CallResourceHandler
}

func New(dir string) *Handler {
	if dir == "" {
		dir = pluginDir()
	}
	h := &Handler{
		licenses: newLicenseChecker(dir, nil, readPluginVersion(dir)),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/license", h.handleLicense)
	h.resources = httpadapter.New(mux)
	return h
}

func (h *Handler) ResourceHandler() backend.CallResourceHandler {
	return h.resources
}

func (h *Handler) CheckHealth(_ context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{Status: backend.HealthStatusOk, Message: "ok"}, nil
}

func (h *Handler) handleLicense(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, h.licenses.check(r.URL.Query().Get("host")))
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func pluginDir() string {
	exe, err := os.Executable()
	if err != nil {
		wd, _ := os.Getwd()
		return wd
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		return filepath.Dir(exe)
	}
	return filepath.Dir(resolved)
}

func readPluginVersion(dir string) string {
	raw, err := os.ReadFile(filepath.Join(dir, "plugin.json"))
	if err != nil {
		return ""
	}
	var meta struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return ""
	}
	return meta.Info.Version
}
