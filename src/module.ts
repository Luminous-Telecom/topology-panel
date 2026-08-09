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
          'Hosts e layout vêm do mapa salvo. Status ICMP via API Zabbix (aba Query não é necessária).',
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
        name: 'Permitir zoom (roda / pinça no mobile)',
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
        description: 'Hex (#2E7D32) ou cor da paleta Grafana — convertida automaticamente no mapa',
        defaultValue: '#2E7D32',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorOffline',
        name: 'Cor offline',
        description: 'Hex (#C62828) ou cor da paleta Grafana — convertida automaticamente no mapa',
        defaultValue: '#C62828',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorUnknown',
        name: 'Cor sem gerência',
        description: 'Hex (#616161) ou cor da paleta Grafana — convertida automaticamente no mapa',
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
        name: 'Cabos',
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
      .addRadio({
        path: 'statusMetric',
        name: 'Métrica de status',
        description: 'ICMP buscado via API Zabbix (icmpping / icmppingsec / icmppingloss)',
        settings: {
          options: [
            { value: 'icmp_rtt', label: 'Tempo de resposta ICMP' },
            { value: 'packet_loss', label: 'Perda de pacotes' },
          ],
        },
        defaultValue: 'icmp_rtt',
        category: ['Zabbix'],
      })
      .addBooleanSwitch({
        path: 'useZabbixProblems',
        name: 'Usar problemas Zabbix',
        description: 'Hosts com alerta ativo ficam vermelhos (overview usa só ICMP)',
        defaultValue: true,
        category: ['Zabbix'],
      })
      .addTextInput({
        path: 'zabbixDatasourceUid',
        name: 'Datasource UID',
        description: 'UID do datasource Zabbix — status, IP e problemas vêm da API (aba Query não é necessária)',
        defaultValue: 'afkagcaezrrpca',
        category: ['Zabbix'],
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
