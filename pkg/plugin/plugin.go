package plugin

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

const ID = "luminous-topology-panel"

type Handler struct {
	licenses  *licenseChecker
	snapshots *snapshotCache
	poll      *pollService
	resources backend.CallResourceHandler
}

func New(dir string) *Handler {
	if dir == "" {
		dir = pluginDir()
	}
	h := &Handler{
		licenses:  newLicenseChecker(dir, nil, readPluginVersion(dir)),
		snapshots: newSnapshotCache(dir),
	}
	h.poll = newPollService(h.snapshots)
	mux := http.NewServeMux()
	mux.HandleFunc("/license", h.handleLicense)
	mux.HandleFunc("/poll", h.handlePoll)
	mux.HandleFunc("/groups", h.handleGroups)
	mux.HandleFunc("/item-names", h.handleItemNames)
	mux.HandleFunc("/interfaces", h.handleInterfaces)
	mux.HandleFunc("/ping", h.handlePing)
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
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, snapshotMaxBytes+1))
	if err != nil || len(raw) == 0 || len(raw) > snapshotMaxBytes {
		http.Error(w, "invalid snapshot", http.StatusBadRequest)
		return
	}
	var envelope struct {
		Key      string          `json:"key"`
		Metadata json.RawMessage `json:"metadata"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		http.Error(w, "invalid snapshot", http.StatusBadRequest)
		return
	}
	key, ok := snapshotKeyFromRaw(envelope.Key)
	if !ok {
		http.Error(w, "invalid snapshot", http.StatusBadRequest)
		return
	}
	if len(envelope.Metadata) == 0 {
		h.writeSnapshot(w, key)
		return
	}
	if !h.snapshots.put(key, raw) {
		http.Error(w, "invalid snapshot", http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) writeSnapshot(w http.ResponseWriter, key string) {
	body, ok := h.snapshots.get(key)
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func snapshotKeyFromRaw(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	if decoded, ok := decodeSnapshotKey(raw); ok {
		return decoded, true
	}
	return raw, true
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
	if err != nil || len(decoded) == 0 || len(decoded) > snapshotMaxKey {
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
