package main

import (
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"

	"github.com/Luminous-Telecom/topology-panel/pkg/plugin"
)

func main() {
	handler := plugin.New("")
	if err := backend.Manage(plugin.ID, backend.ServeOpts{
		CallResourceHandler: handler.ResourceHandler(),
		CheckHealthHandler:  handler,
	}); err != nil {
		log.DefaultLogger.Error(err.Error())
		os.Exit(1)
	}
}
