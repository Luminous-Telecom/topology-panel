import { PanelPlugin } from '@grafana/data';
import { TopologyPanel } from './components/TopologyPanel';
import { TopologyEditor } from './editor/TopologyEditor';
import { TopologyPanelOptions, defaultOptions } from './types';

export const plugin = new PanelPlugin<TopologyPanelOptions>(TopologyPanel)
  .setPanelOptions((builder) => {
    builder
      .addCustomEditor({
        id: 'map',
        path: 'map',
        name: 'Layout e links',
        description:
          'Hosts vêm da aba Query (Zabbix). Aqui ajuste posição, submapas e ligações.',
        editor: TopologyEditor,
        category: ['Topologia'],
        defaultValue: defaultOptions().map,
      })
      .addBooleanSwitch({
        path: 'showGrid',
        name: 'Mostrar grade',
        defaultValue: false,
        category: ['Topologia'],
      })
      .addNumberInput({
        path: 'gridSize',
        name: 'Tamanho da grade',
        description: 'Passo da grade em pixels (ex.: 10)',
        defaultValue: 10,
        category: ['Topologia'],
      })
      .addBooleanSwitch({
        path: 'snapToGrid',
        name: 'Alinhar à grade',
        description: 'Encaixa hosts e retângulos nas linhas da grade ao mover ou redimensionar',
        defaultValue: true,
        category: ['Topologia'],
      })
      .addBooleanSwitch({
        path: 'enablePan',
        name: 'Permitir arrastar mapa',
        defaultValue: true,
        category: ['Interação'],
      })
      .addBooleanSwitch({
        path: 'enableZoom',
        name: 'Permitir zoom (roda do mouse)',
        defaultValue: true,
        category: ['Interação'],
      })
      .addBooleanSwitch({
        path: 'showSubtitle',
        name: 'Mostrar subtítulo (IP)',
        defaultValue: true,
        category: ['Aparência'],
      })
      .addNumberInput({
        path: 'nodeFontSize',
        name: 'Tamanho da fonte',
        defaultValue: 11,
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorOnline',
        name: 'Cor online',
        defaultValue: '#2E7D32',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorOffline',
        name: 'Cor offline',
        defaultValue: '#C62828',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorUnknown',
        name: 'Cor sem dados',
        defaultValue: '#616161',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorSubmap',
        name: 'Cor submapa',
        defaultValue: '#1565C0',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorLink',
        name: 'Cor dos links',
        defaultValue: '#78909C',
        category: ['Aparência'],
      })
      .addNumberInput({
        path: 'colorLinkWidth',
        name: 'Espessura dos links',
        defaultValue: 2,
        category: ['Aparência'],
      })
      .addTextInput({
        path: 'statusHostField',
        name: 'Campo host (após transform)',
        description: 'Nome da coluna com o host Zabbix',
        defaultValue: 'host',
        category: ['Zabbix'],
      })
      .addTextInput({
        path: 'statusValueField',
        name: 'Campo status (perda pacotes)',
        description: 'Coluna numérica: 0=online, >= limiar=offline',
        defaultValue: 'loss',
        category: ['Zabbix'],
      })
      .addTextInput({
        path: 'hostIpField',
        name: 'Campo IP (query)',
        description: 'Coluna IP nos dados, se usar query separada',
        defaultValue: 'ip',
        category: ['Zabbix'],
      })
      .addTextInput({
        path: 'zabbixGroupFilter',
        name: 'Grupo Zabbix',
        description: 'Mesmo grupo da query (ex.: Dude/Mapa/SWV) — usado para buscar IP',
        defaultValue: '',
        category: ['Zabbix'],
      })
      .addTextInput({
        path: 'zabbixDatasourceUid',
        name: 'Datasource UID',
        description: 'UID do datasource Zabbix',
        defaultValue: 'afkagcaezrrpca',
        category: ['Zabbix'],
      });
  });
