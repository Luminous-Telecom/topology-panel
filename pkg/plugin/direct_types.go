package plugin

const (
	zabbixItemGetBatch       = 500
	problemsLimit            = 1001
	zabbixProblemMinSeverity = 2
	hostMonitored            = "0"
	minRefreshSec            = 5
	defaultRefreshSec        = 60
	defaultNodeWidth         = 80
	defaultNodeHeight        = 40
	zabbixGenericError       = "Falha ao consultar o Zabbix. Verifique o datasource e os grupos configurados."
	zabbixNoGroupsError      = "Nenhum dos grupos configurados existe no Zabbix."
	zabbixNoStatusItemsError = "Nenhum host dos grupos respondeu com o item de status. Confira o nome do item em \"Item de status\"."
	zabbixNoDatasourceError  = "Datasource Zabbix não configurado."
	zabbixSessionError       = "Grafana recusou a sessão ao consultar o Zabbix."
	trafficOutputItemID      = "itemid"
	trafficOutputKey         = "key_"
	trafficOutputName        = "name"
	trafficOutputHostID      = "hostid"
	trafficOutputLastValue   = "lastvalue"
	trafficOutputLastClock   = "lastclock"
)

var trafficOutput = []string{
	trafficOutputItemID,
	trafficOutputKey,
	trafficOutputName,
	trafficOutputHostID,
	trafficOutputLastValue,
	trafficOutputLastClock,
}

type zabbixStatusRequest struct {
	DatasourceUID       string               `json:"datasourceUid"`
	GroupNames          []string             `json:"groupNames"`
	StatusItemKey       string               `json:"statusItemKey"`
	RefreshSec          int                  `json:"refreshSec"`
	TrafficItemIDs      []string             `json:"trafficItemIds"`
	TrafficKeys         []string             `json:"trafficKeys"`
	StatusValueMappings []statusValueMapping `json:"statusValueMappings"`
	Nodes               []statusMapNode      `json:"nodes"`
	Links               []statusMapLink      `json:"links"`
	ChildHostKeys       map[string][]string  `json:"childHostKeys"`
	SubmapHosts         map[string][]string  `json:"submapHosts"`
	SubmapHostsFailed   []string             `json:"submapHostsFailed"`
}

type statusValueMapping struct {
	Value  *float64 `json:"value"`
	From   *float64 `json:"from"`
	To     *float64 `json:"to"`
	Status string   `json:"status"`
}

type statusMapNode struct {
	ID               string   `json:"id"`
	Type             string   `json:"type"`
	X                float64  `json:"x"`
	Y                float64  `json:"y"`
	W                *float64 `json:"w"`
	H                *float64 `json:"h"`
	NetworkID        string   `json:"networkId"`
	ZabbixHost       string   `json:"zabbixHost"`
	Label            string   `json:"label"`
	Subtitle         string   `json:"subtitle"`
	SubmapChildMapID string   `json:"submapChildMapId"`
	QueryRefIDs      []string `json:"queryRefIds"`
}

type statusMapLink struct {
	From         string `json:"from"`
	To           string `json:"to"`
	FromRxItemID string `json:"fromRxItemId"`
	FromTxItemID string `json:"fromTxItemId"`
	ToRxItemID   string `json:"toRxItemId"`
	ToTxItemID   string `json:"toTxItemId"`
}

type zabbixStatusResponse struct {
	SavedAt        int64                     `json:"savedAt"`
	Hosts          []compactHost             `json:"hosts"`
	RegionStats    []regionStat              `json:"regionStats"`
	Problems       map[string]problemSummary `json:"problems"`
	LastValues     map[string]itemLastValue  `json:"lastValues"`
	InterfaceItems []interfaceItem           `json:"interfaceItems"`
	Error          string                    `json:"error,omitempty"`
}

type compactHost struct {
	HostID    string   `json:"hostId"`
	Host      string   `json:"host"`
	Name      string   `json:"name"`
	IP        string   `json:"ip,omitempty"`
	Groups    []string `json:"groups"`
	Status    string   `json:"status,omitempty"`
	LastValue string   `json:"lastvalue,omitempty"`
	LastClock string   `json:"lastclock,omitempty"`
	ItemID    string   `json:"itemId,omitempty"`
}

type regionStat struct {
	NodeID      string   `json:"nodeId"`
	Up          int      `json:"up"`
	Down        int      `json:"down"`
	Degraded    int      `json:"degraded"`
	Unknown     int      `json:"unknown"`
	Total       int      `json:"total"`
	RxBps       *float64 `json:"rxBps,omitempty"`
	TxBps       *float64 `json:"txBps,omitempty"`
	LoadFailed  bool     `json:"loadFailed,omitempty"`
	LoadPending bool     `json:"loadPending,omitempty"`
}

type problemSummary struct {
	Count       int      `json:"count"`
	MaxSeverity float64  `json:"maxSeverity"`
	Names       []string `json:"names,omitempty"`
}

type itemLastValue struct {
	ItemID    string `json:"itemid"`
	LastValue string `json:"lastvalue,omitempty"`
	LastClock string `json:"lastclock,omitempty"`
}

type interfaceItem struct {
	ItemID    string `json:"itemid"`
	Key       string `json:"key_"`
	Name      string `json:"name,omitempty"`
	HostID    string `json:"hostid,omitempty"`
	LastValue string `json:"lastvalue,omitempty"`
	LastClock string `json:"lastclock,omitempty"`
}

type zabbixDirectHost struct {
	HostID string
	Host   string
	Name   string
	IP     string
	Groups []string
}

type zabbixResolvedGroups struct {
	ResolvedGroups []string
	GroupIDs       []string
}

type zabbixDirectMetadata struct {
	Hosts          []zabbixDirectHost
	ResolvedGroups []string
	GroupIDs       []string
}

type liveSnapshot struct {
	SavedAt          int64
	Metadata         zabbixDirectMetadata
	KnownStatusItems []interfaceItem
	LastValues       map[string]itemLastValue
	InterfaceItems   []interfaceItem
	Problems         map[string]problemSummary
}

type trafficFetch struct {
	LastValues     map[string]itemLastValue
	ItemIDByKey    map[string]string
	InterfaceItems []interfaceItem
}

func emptySnapshot() liveSnapshot {
	return liveSnapshot{
		LastValues:       map[string]itemLastValue{},
		InterfaceItems:   []interfaceItem{},
		Problems:         map[string]problemSummary{},
		KnownStatusItems: []interfaceItem{},
		Metadata: zabbixDirectMetadata{
			Hosts:          []zabbixDirectHost{},
			ResolvedGroups: []string{},
			GroupIDs:       []string{},
		},
	}
}

func emptyStatusResponse() zabbixStatusResponse {
	return zabbixStatusResponse{
		Hosts:          []compactHost{},
		RegionStats:    []regionStat{},
		Problems:       map[string]problemSummary{},
		LastValues:     map[string]itemLastValue{},
		InterfaceItems: []interfaceItem{},
	}
}
