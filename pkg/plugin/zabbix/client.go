package zabbix

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
)

const (
	callTimeout       = 15 * time.Second
	statusCallTimeout = 45 * time.Second
)

// API encaminha JSON-RPC ao datasource Zabbix via proxy do Grafana. *Client implementa.
type API interface {
	Call(ctx context.Context, method string, params map[string]any, timeout time.Duration) (json.RawMessage, error)
}

// Client encaminha JSON-RPC ao datasource Zabbix via proxy do Grafana.
type Client struct {
	datasourceUID string
	grafanaURL    string
	orgID         int64
	headers       http.Header
	httpClient    *http.Client
}

func NewClient(ctx context.Context, r *http.Request, datasourceUID string) (*Client, error) {
	uid := strings.TrimSpace(datasourceUID)
	if uid == "" {
		return nil, fmt.Errorf("datasource vazio")
	}
	pCtx := backend.PluginConfigFromContext(ctx)
	if pCtx.GrafanaConfig == nil {
		return nil, fmt.Errorf("contexto do Grafana indisponível")
	}
	appURL, err := pCtx.GrafanaConfig.AppURL()
	if err != nil {
		return nil, err
	}
	cli, err := httpclient.New(httpclient.Options{
		ForwardHTTPHeaders: true,
		Timeouts:           &httpclient.DefaultTimeoutOptions,
	})
	if err != nil {
		return nil, err
	}
	cli.Timeout = callTimeout
	return &Client{
		datasourceUID: uid,
		grafanaURL:    strings.TrimRight(appURL, "/"),
		orgID:         pCtx.OrgID,
		headers:       identityHeadersFromRequest(r.Header, pCtx.OrgID),
		httpClient:    cli,
	}, nil
}

func identityHeadersFromRequest(src http.Header, orgID int64) http.Header {
	out := http.Header{}
	for key, values := range src {
		name := key
		lower := strings.ToLower(key)
		if strings.HasPrefix(lower, "http_") {
			name = key[len("http_"):]
			lower = strings.ToLower(name)
		}
		switch lower {
		case "cookie", "authorization", "x-id-token", "x-grafana-id", "x-grafana-org-id":
			canonical := http.CanonicalHeaderKey(name)
			for _, value := range values {
				if strings.TrimSpace(value) != "" {
					out.Add(canonical, value)
				}
			}
		}
	}
	if orgID > 0 && out.Get("X-Grafana-Org-Id") == "" {
		out.Set("X-Grafana-Org-Id", strconv.FormatInt(orgID, 10))
	}
	return out
}

type apiEnvelope struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) Call(ctx context.Context, method string, params map[string]any, timeout time.Duration) (json.RawMessage, error) {
	if timeout <= 0 {
		timeout = callTimeout
	}
	body, err := json.Marshal(map[string]any{
		"method": method,
		"params": params,
	})
	if err != nil {
		return nil, err
	}
	target := fmt.Sprintf("%s/api/datasources/uid/%s/resources/zabbix-api",
		c.grafanaURL, url.PathEscape(c.datasourceUID))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, values := range c.headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}
	client := *c.httpClient
	client.Timeout = timeout
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == http.StatusUnauthorized {
			return nil, fmt.Errorf("Grafana recusou a sessão ao consultar o Zabbix")
		}
		return nil, fmt.Errorf("proxy Zabbix HTTP %d", resp.StatusCode)
	}
	var envelope apiEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, err
	}
	if envelope.Error != nil {
		msg := strings.TrimSpace(envelope.Error.Message)
		if msg == "" {
			msg = "Falha ao consultar o Zabbix."
		}
		return nil, fmt.Errorf("%s", msg)
	}
	return envelope.Result, nil
}
