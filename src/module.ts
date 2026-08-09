import {
  FieldColorModeId,
  FieldConfigProperty,
  PanelPlugin,
  ThresholdsMode,
} from '@grafana/data';
import { TopologyPanel } from './components/TopologyPanel';
import { DashboardNavChoicesEditor } from './components/DashboardNavChoicesEditor';
import { QueryDisplayRefIdsEditor } from './components/QueryDisplayRefIdsEditor';
import { TopologyEditor } from './editor/TopologyEditor';
import { TopologyPanelOptions, defaultOptions } from './types';

export const plugin = new PanelPlugin<TopologyPanelOptions>(TopologyPanel)
  .useFieldConfig({
    standardOptions: {
      [FieldConfigProperty.Mappings]: {},
      [FieldConfigProperty.Thresholds]: {
        defaultValue: {
          mode: ThresholdsMode.Absolute,
          steps: [
            // icmppingsec: 0 = offline; >0 = online
            { value: null as unknown as number, color: 'semi-dark-red' },
            { value: 0.0000001, color: 'semi-dark-green' },
          ],
        },
      },
      [FieldConfigProperty.Color]: {
        defaultValue: {
          mode: FieldColorModeId.Thresholds,
        },
      },
    },
  })
  .setPanelOptions((builder) => {
    builder
      .addCustomEditor({
        id: 'map',
        path: 'map',
        name: 'Layout e links',
        description:
          'Layout e links. Query Zabbix crua (time_series). Cores de status: Thresholds / Value mappings.',
        editor: TopologyEditor,
        category: ['Topologia'],
        defaultValue: defaultOptions().map,
      })
      .addBooleanSwitch({
        path: 'showDashboardNav',
        name: 'Botão extra no mapa',
        description:
          'Opcional. O select principal é a variável Grafana na barra do painel de controle (Configurações → Variáveis → mapa)',
        defaultValue: false,
        category: ['Navegação'],
      })
      .addTextInput({
        path: 'dashboardNavVariable',
        name: 'Nome da variável Grafana',
        description: 'Variável na barra do dashboard (ex.: mapa). Ao trocar, abre o dashboard do valor (UID).',
        defaultValue: 'mapa',
        category: ['Navegação'],
      })
      .addTextInput({
        path: 'dashboardNavLabel',
        name: 'Rótulo do botão no mapa',
        defaultValue: 'Dashboards',
        category: ['Navegação'],
        showIf: (opts) => opts.showDashboardNav === true,
      })
      .addCustomEditor({
        id: 'dashboardNavChoices',
        path: 'dashboardNavChoices',
        name: 'Dashboards do botão no mapa',
        description: 'Só para o botão opcional no canvas. A lista da variável Grafana é editada em Configurações → Variáveis.',
        editor: DashboardNavChoicesEditor,
        category: ['Navegação'],
        defaultValue: [],
        showIf: (opts) => opts.showDashboardNav === true,
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
        name: 'Permitir zoom (roda / pinça no mobile)',
        defaultValue: true,
        category: ['Interação'],
      })
      .addBooleanSwitch({
        path: 'showMinimap',
        name: 'Mini mapa de visão geral',
        description: 'Caixa no canto inferior esquerdo; arraste dentro dela para mover o mapa',
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
        name: 'Cor online (fallback)',
        description: 'Usada se Thresholds/Value mappings não definirem cor',
        defaultValue: '#2E7D32',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorOffline',
        name: 'Cor offline (fallback)',
        description: 'Usada se Thresholds/Value mappings não definirem cor',
        defaultValue: '#C62828',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorAlert',
        name: 'Cor alerta',
        description: 'Host online com problema ativo no Zabbix (padrão laranja #EF6C00)',
        defaultValue: '#EF6C00',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorUnknown',
        name: 'Cor sem gerência',
        description: 'Host sem valor na Query',
        defaultValue: '#616161',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorStatic',
        name: 'Cor estático',
        description: 'Cor de fundo padrão dos rótulos estáticos (pode sobrescrever por nó)',
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
        name: 'Cor base dos cabos',
        defaultValue: '#78909C',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorLinkDownload',
        name: 'Cor download (→ origem)',
        description: 'Faixa animada no sentido da origem',
        defaultValue: '#4FC3F7',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorLinkUpload',
        name: 'Cor upload (→ destino)',
        description: 'Faixa animada no sentido do destino (seta)',
        defaultValue: '#FFB74D',
        category: ['Aparência'],
      })
      .addNumberInput({
        path: 'colorLinkWidth',
        name: 'Espessura dos cabos',
        defaultValue: 2,
        category: ['Aparência'],
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: 'Mostrar legenda',
        description: 'Exibe a caixa de legenda na lateral direita do mapa',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendOnline',
        name: 'Online',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendOffline',
        name: 'Offline',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendAlert',
        name: 'Alerta',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendUnknown',
        name: 'Sem gerência',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendStatic',
        name: 'Estático',
        defaultValue: false,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendSubmap',
        name: 'Submapa',
        defaultValue: false,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendLink',
        name: 'Cabo',
        defaultValue: false,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendDownload',
        name: 'Download (origem)',
        defaultValue: false,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendUpload',
        name: 'Upload (destino)',
        defaultValue: false,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'useZabbixProblems',
        name: 'Usar problemas Zabbix',
        description: 'Hosts online com problema ativo usam a cor de alerta',
        defaultValue: true,
        category: ['Zabbix'],
      })
      .addCustomEditor({
        id: 'displayQueryRefIds',
        path: 'displayQueryRefIds',
        name: 'Mostrar hosts da query no mapa',
        editor: QueryDisplayRefIdsEditor,
        category: ['Zabbix'],
        defaultValue: undefined,
      })
      .addTextInput({
        path: 'toolUsername',
        name: 'Usuário (Tools)',
        description: 'Usado em Winbox, SSH e Telnet quando o host não tem usuário próprio. Deixe vazio para abrir só com o IP.',
        defaultValue: '',
        category: ['Acesso remoto'],
      })
      .addTextInput({
        path: 'toolPassword',
        name: 'Senha (Tools)',
        description:
          'Opcional — padrão do painel. Preferível cadastrar por host em Propriedades. Fica no JSON do dashboard.',
        defaultValue: '',
        category: ['Acesso remoto'],
      });
  });
