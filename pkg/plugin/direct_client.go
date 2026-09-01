package plugin

// Painel Grafana: o processo Go NÃO recebe DataSourceInstanceSettings nem as
// credenciais do Zabbix. A sessão do usuário (Cookie / Authorization /
// X-Grafana-Id / X-Grafana-Org-Id) é reencaminhada para a API de resource do
// datasource no próprio Grafana:
//
//	POST {GF_APP_URL}/api/datasources/uid/{uid}/resources/zabbix-api
//
// A URL sai de PluginContext.GrafanaConfig.AppURL(), com fallback para
// GF_APP_URL e depois GF_SERVER_ROOT_URL. O grafana-zabbix autentica com a
// sessão e fala com o Zabbix. Este processo nunca vê usuário, senha ou token
// do Zabbix.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

const zabbixAPITimeout = 30 * time.Second

var zabbixHTTPClient = &http.Client{Timeout: zabbixAPITimeout}

type grafanaSession struct {
	Cookie        string
	Authorization string
	GrafanaID     string
	GrafanaOrgID  string
	AppURL        string
}

type zabbixCallFn func(ctx context.Context, session grafanaSession, datasourceUID, method string, params map[string]any) (json.RawMessage, error)

func sessionFromRequest(r *http.Request) grafanaSession {
	return grafanaSession{
		Cookie:        r.Header.Get("Cookie"),
		Authorization: r.Header.Get("Authorization"),
		GrafanaID:     headerOr(r, "X-Grafana-Id"),
		GrafanaOrgID:  headerOr(r, "X-Grafana-Org-Id"),
		AppURL:        grafanaAppURL(r.Context()),
	}
}

func headerOr(r *http.Request, key string) string {
	if v := r.Header.Get(key); v != "" {
		return v
	}
	return r.Header.Get(http.CanonicalHeaderKey(key))
}

func grafanaAppURL(ctx context.Context) string {
	pluginCtx := backend.PluginConfigFromContext(ctx)
	if pluginCtx.GrafanaConfig != nil {
		if u, err := pluginCtx.GrafanaConfig.AppURL(); err == nil {
			if trimmed := strings.TrimRight(strings.TrimSpace(u), "/"); trimmed != "" {
				return trimmed
			}
		}
	}
	for _, key := range []string{"GF_APP_URL", "GF_SERVER_ROOT_URL"} {
		if u := strings.TrimRight(strings.TrimSpace(os.Getenv(key)), "/"); u != "" {
			return u
		}
	}
	return ""
}

func grafanaZabbixCall(ctx context.Context, session grafanaSession, datasourceUID, method string, params map[string]any) (json.RawMessage, error) {
	uid := strings.TrimSpace(datasourceUID)
	if uid == "" {
		return nil, errors.New(zabbixNoDatasourceError)
	}
	appURL := strings.TrimRight(strings.TrimSpace(session.AppURL), "/")
	if appURL == "" {
		return nil, errors.New(zabbixGenericError)
	}
	if params == nil {
		params = map[string]any{}
	}
	payload, err := json.Marshal(map[string]any{"method": method, "params": params})
	if err != nil {
		return nil, err
	}
	endpoint := appURL + "/api/datasources/uid/" + url.PathEscape(uid) + "/resources/zabbix-api"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if session.Cookie != "" {
		req.Header.Set("Cookie", session.Cookie)
	}
	if session.Authorization != "" {
		req.Header.Set("Authorization", session.Authorization)
	}
	if session.GrafanaID != "" {
		req.Header.Set("X-Grafana-Id", session.GrafanaID)
	}
	if session.GrafanaOrgID != "" {
		req.Header.Set("X-Grafana-Org-Id", session.GrafanaOrgID)
	}
	resp, err := zabbixHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, errors.New(zabbixSessionError)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.New(zabbixGenericError)
	}
	return unwrapZabbixResult(body)
}

func unwrapZabbixResult(body []byte) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return json.RawMessage("null"), nil
	}
	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  json.RawMessage `json:"error"`
	}
	if err := json.Unmarshal(trimmed, &envelope); err == nil {
		if len(envelope.Error) > 0 && string(envelope.Error) != "null" {
			return nil, fmt.Errorf("%s", zabbixErrorMessage(envelope.Error))
		}
		if len(envelope.Result) > 0 && string(envelope.Result) != "null" {
			return envelope.Result, nil
		}
		if bytes.Contains(trimmed, []byte(`"result"`)) {
			if len(envelope.Result) == 0 {
				return json.RawMessage("null"), nil
			}
			return envelope.Result, nil
		}
	}
	return json.RawMessage(trimmed), nil
}

func zabbixErrorMessage(raw json.RawMessage) string {
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		if msg := strings.TrimSpace(asString); msg != "" {
			return msg
		}
	}
	var asObj struct {
		Message string `json:"message"`
		Data    string `json:"data"`
	}
	if err := json.Unmarshal(raw, &asObj); err == nil {
		if msg := strings.TrimSpace(asObj.Message); msg != "" {
			return msg
		}
		if msg := strings.TrimSpace(asObj.Data); msg != "" {
			return msg
		}
	}
	return zabbixGenericError
}

func zabbixRPC[T any](ctx context.Context, call zabbixCallFn, session grafanaSession, uid, method string, params map[string]any) (T, error) {
	var zero T
	raw, err := call(ctx, session, uid, method, params)
	if err != nil {
		return zero, err
	}
	if len(bytes.TrimSpace(raw)) == 0 || string(raw) == "null" {
		return zero, nil
	}
	var out T
	if err := json.Unmarshal(raw, &out); err != nil {
		return zero, err
	}
	return out, nil
}
