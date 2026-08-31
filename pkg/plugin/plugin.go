package plugin

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

const ID = "luminous-topology-panel"

type Handler struct {
	licenses  *licenseChecker
	snapshots *snapshotCache
	resources backend.CallResourceHandler
}

func New(dir string) *Handler {
	if dir == "" {
		dir = pluginDir()
	}
	h := &Handler{
		licenses:  newLicenseChecker(dir, nil, readPluginVersion(dir)),
		snapshots: newSnapshotCache(),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/license", h.handleLicense)
	mux.HandleFunc("/snapshot", h.handleSnapshot)
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

func (h *Handler) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	license := h.licenses.check(r.URL.Query().Get("host"))
	if !license.Valid {
		status := http.StatusForbidden
		if license.Retryable {
			status = http.StatusServiceUnavailable
		}
		writeJSON(w, status, license)
		return
	}
	switch r.Method {
	case http.MethodGet:
		key, ok := decodeSnapshotKey(r.URL.Query().Get("key"))
		if !ok {
			http.NotFound(w, r)
			return
		}
		body, ok := h.snapshots.get(key)
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	case http.MethodPost:
		raw, err := io.ReadAll(io.LimitReader(r.Body, snapshotMaxBytes+1))
		if err != nil || len(raw) == 0 || len(raw) > snapshotMaxBytes {
			http.Error(w, "invalid snapshot", http.StatusBadRequest)
			return
		}
		var envelope struct {
			Key string `json:"key"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			http.Error(w, "invalid snapshot", http.StatusBadRequest)
			return
		}
		key, ok := decodeSnapshotKey(envelope.Key)
		if !ok {
			key = envelope.Key
		}
		if !h.snapshots.put(key, raw) {
			http.Error(w, "invalid snapshot", http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func decodeSnapshotKey(raw string) (string, bool) {
	trimmed := raw
	if trimmed == "" {
		return "", false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(trimmed)
	if err != nil {
		decoded, err = base64.URLEncoding.DecodeString(trimmed)
	}
	if err != nil || len(decoded) == 0 || len(decoded) > 512 {
		return "", false
	}
	return string(decoded), true
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
