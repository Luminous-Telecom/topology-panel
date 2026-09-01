package plugin

import (
	"encoding/json"
	"io"
	"net/http"
)

func (h *Handler) handlePoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, snapshotMaxBytes+1))
	if err != nil || len(raw) == 0 || len(raw) > snapshotMaxBytes {
		http.Error(w, "invalid poll request", http.StatusBadRequest)
		return
	}
	var req PollRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		http.Error(w, "invalid poll request", http.StatusBadRequest)
		return
	}
	if req.DatasourceUID == "" || req.StatusItemKey == "" || len(req.GroupNames) == 0 {
		http.Error(w, "invalid poll request", http.StatusBadRequest)
		return
	}
	resp := h.poll.Handle(r.Context(), r, req)
	writeJSON(w, http.StatusOK, resp)
}
