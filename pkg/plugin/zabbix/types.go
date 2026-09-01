package zabbix

// Tipos espelham o JSON do snapshot que o painel consome.

type DirectHost struct {
	HostID      string    `json:"hostid"`
	Host        string    `json:"host"`
	Name        string    `json:"name"`
	IP          string    `json:"ip,omitempty"`
	Description string    `json:"description,omitempty"`
	Groups      []string  `json:"groups"`
	Tags        []HostTag `json:"tags,omitempty"`
}

type HostTag struct {
	Tag   string `json:"tag"`
	Value string `json:"value"`
}

type DirectMetadata struct {
	Hosts          []DirectHost `json:"hosts"`
	ResolvedGroups []string     `json:"resolvedGroups"`
	GroupIDs       []string     `json:"groupIds"`
}

type InterfaceItem struct {
	ItemID    string `json:"itemid"`
	Key       string `json:"key_"`
	Name      string `json:"name,omitempty"`
	LastValue string `json:"lastvalue,omitempty"`
	LastClock string `json:"lastclock,omitempty"`
	HostID    string `json:"hostid,omitempty"`
}

type ItemLastValue struct {
	ItemID    string `json:"itemid"`
	LastValue string `json:"lastvalue,omitempty"`
	LastClock string `json:"lastclock,omitempty"`
}

type HostProblemSummary struct {
	Count       int      `json:"count"`
	MaxSeverity int      `json:"maxSeverity"`
	Names       []string `json:"names,omitempty"`
}

type HostProblemsMap map[string]HostProblemSummary

type LiveSnapshot struct {
	SavedAt          int64                    `json:"savedAt"`
	Metadata         DirectMetadata           `json:"metadata"`
	KnownStatusItems []InterfaceItem          `json:"knownStatusItems"`
	LastValues       map[string]ItemLastValue `json:"lastValues"`
	InterfaceItems   []InterfaceItem          `json:"interfaceItems"`
	Problems         HostProblemsMap          `json:"problems"`
}

type ResolvedGroups struct {
	ResolvedGroups []string `json:"resolvedGroups"`
	GroupIDs       []string `json:"groupIds"`
}

type InterfaceHostRef struct {
	HostKey string `json:"hostKey"`
	HostID  string `json:"hostid,omitempty"`
}

type HostInterfaceItems struct {
	HostKey string          `json:"hostKey"`
	HostID  string          `json:"hostid"`
	Items   []InterfaceItem `json:"items"`
}

type IcmpStatus struct {
	Reachable *bool    `json:"reachable"`
	LossPct   *float64 `json:"lossPct"`
	RttMs     *float64 `json:"rttMs"`
	LastClock *float64 `json:"lastClock,omitempty"`
	Error     string   `json:"error,omitempty"`
}

type PingResult struct {
	Success bool        `json:"success"`
	Output  string      `json:"output"`
	Error   string      `json:"error,omitempty"`
	ICMP    *IcmpStatus `json:"icmp,omitempty"`
}
