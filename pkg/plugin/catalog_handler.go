package plugin

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/Luminous-Telecom/topology-panel/pkg/plugin/zabbix"
)

const catalogMaxBytes = 256 << 10

const zabbixQueryFailed = "Falha ao consultar o Zabbix."

type groupsRequest struct {
	DatasourceUID string `json:"datasourceUid"`
}

type groupsResponse struct {
	Groups []string `json:"groups"`
	Error  string   `json:"error,omitempty"`
}

type itemNamesRequest struct {
	DatasourceUID string   `json:"datasourceUid"`
	GroupNames    []string `json:"groupNames"`
}

type itemNamesResponse struct {
	Names []string `json:"names"`
	Error string   `json:"error,omitempty"`
}

type interfacesRequest struct {
	DatasourceUID string                    `json:"datasourceUid"`
	Hosts         []zabbix.InterfaceHostRef `json:"hosts"`
	SearchKeys    []string                  `json:"searchKeys"`
}

type interfacesResponse struct {
	Entries []zabbix.HostInterfaceItems `json:"entries"`
	Error   string                      `json:"error,omitempty"`
}

type pingRequest struct {
	DatasourceUID string `json:"datasourceUid"`
	HostName      string `json:"hostName"`
	Mode          string `json:"mode"`
}

func readLimitedJSON(r *http.Request, maxBytes int64, dest any) bool {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
	if err != nil || len(raw) == 0 || int64(len(raw)) > maxBytes {
		return false
	}
	return json.Unmarshal(raw, dest) == nil
}

func (h *Handler) zabbixClient(w http.ResponseWriter, r *http.Request, datasourceUID string) (*zabbix.Client, bool) {
	client, err := zabbix.NewClient(r.Context(), r, datasourceUID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"error": zabbixQueryFailed})
		return nil, false
	}
	return client, true
}

func (h *Handler) handleGroups(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req groupsRequest
	if !readLimitedJSON(r, catalogMaxBytes, &req) || req.DatasourceUID == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	client, ok := h.zabbixClient(w, r, req.DatasourceUID)
	if !ok {
		return
	}
	groups, err := zabbix.FetchHostGroupNames(r.Context(), client)
	if err != nil {
		writeJSON(w, http.StatusOK, groupsResponse{Error: zabbixQueryFailed})
		return
	}
	writeJSON(w, http.StatusOK, groupsResponse{Groups: groups})
}

func (h *Handler) handleItemNames(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req itemNamesRequest
	if !readLimitedJSON(r, catalogMaxBytes, &req) || req.DatasourceUID == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	client, ok := h.zabbixClient(w, r, req.DatasourceUID)
	if !ok {
		return
	}
	names, err := zabbix.FetchItemNames(r.Context(), client, req.GroupNames)
	if err != nil {
		writeJSON(w, http.StatusOK, itemNamesResponse{Error: zabbixQueryFailed})
		return
	}
	writeJSON(w, http.StatusOK, itemNamesResponse{Names: names})
}

func (h *Handler) handleInterfaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req interfacesRequest
	if !readLimitedJSON(r, catalogMaxBytes, &req) || req.DatasourceUID == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	client, ok := h.zabbixClient(w, r, req.DatasourceUID)
	if !ok {
		return
	}
	entries, err := zabbix.FetchHostInterfaceItems(r.Context(), client, req.Hosts, req.SearchKeys)
	if err != nil {
		writeJSON(w, http.StatusOK, interfacesResponse{Error: zabbixQueryFailed})
		return
	}
	writeJSON(w, http.StatusOK, interfacesResponse{Entries: entries})
}

func (h *Handler) handlePing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req pingRequest
	if !readLimitedJSON(r, catalogMaxBytes, &req) || req.DatasourceUID == "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	client, ok := h.zabbixClient(w, r, req.DatasourceUID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, zabbix.RunPing(r.Context(), client, req.DatasourceUID, req.HostName, req.Mode))
}
