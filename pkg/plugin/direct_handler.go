package plugin

import (
	"encoding/json"
	"net/http"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

func (h *Handler) ResourceHandlerWithStatus() backend.CallResourceHandler {
	mux := http.NewServeMux()
	mux.HandleFunc("/license", h.handleLicense)
	mux.HandleFunc("/zabbix-status", h.handleZabbixStatus)
	return httpadapter.New(mux)
}

func (h *Handler) handleZabbixStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req zabbixStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		resp := emptyStatusResponse()
		resp.Error = zabbixGenericError
		writeJSON(w, http.StatusOK, resp)
		return
	}
	writeJSON(w, http.StatusOK, statusService.handle(r.Context(), sessionFromRequest(r), req))
}
