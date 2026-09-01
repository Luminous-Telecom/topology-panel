package zabbix

// Exportações usadas pelo serviço de poll no backend.

func StatusItemSearchPublic(statusItemKey string) string {
	key, _ := statusItemSearch(statusItemKey)
	return key
}

func StatusItemsCoverHostsPublic(items []InterfaceItem, hostids []string) bool {
	return statusItemsCoverHosts(items, hostids)
}

func StatusLastValuesPresentPublic(lastValues map[string]ItemLastValue, items []InterfaceItem) bool {
	return statusLastValuesPresent(lastValues, items)
}

func ApplyLastValuesToStatusItemsPublic(items []InterfaceItem, lastValues map[string]ItemLastValue, interfaceItems []InterfaceItem) []InterfaceItem {
	return applyLastValuesToStatusItems(items, lastValues, interfaceItems)
}

func MergeItemIDByKeyPublic(dst map[string]string, items []InterfaceItem) {
	mergeItemIDByKey(dst, items)
}

func TrafficKeyResolvedPublic(itemIDByKey map[string]string, key string) bool {
	return trafficKeyResolved(itemIDByKey, key)
}

func AliasLastValuesByItemKeyPublic(lastValues map[string]ItemLastValue, itemIDByKey map[string]string) map[string]ItemLastValue {
	return aliasLastValuesByItemKey(lastValues, itemIDByKey)
}

func CoalesceTrafficPublic(incoming TrafficFetchResult, previous TrafficFetchResult) TrafficFetchResult {
	return coalesceTraffic(incoming, previous)
}

func NumericStatusItemIDsPublic(items []InterfaceItem) []string {
	return numericStatusItemIDs(items)
}

func IsNumericIDPublic(id string) bool {
	return isNumericID(id)
}
