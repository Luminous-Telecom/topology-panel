import { PanelPlugin } from '@grafana/data';
import { TopologyPanelLoader } from './TopologyPanelLoader';
import {
  ChildMapsEditor,
  HostTypeColorsEditor,
  LicenseStatusEditor,
  QueryDisplayRefIdsEditor,
  TopologyHostsEditor,
  TopologyLayoutEditor,
  TopologyLinksEditor,
  TopologySubmapsEditor,
  TopologyTemplatesEditor,
  ZabbixDatasourceEditor,
} from './editor/lazyPanelEditors';
import { addMapSection, MAP_SECTION_ROOT } from './editor/mapSectionNested';
import {
  TopologyPanelOptions,
  ZABBIX_DIRECT_DEFAULT_REFRESH_SEC,
  ZABBIX_DIRECT_MIN_REFRESH_SEC,
  defaultHostTypeColors,
} from './types';

export const plugin = new PanelPlugin<TopologyPanelOptions>(TopologyPanelLoader)
  .setPanelOptions((builder) => {
    builder
      .addCustomEditor({
        id: 'licenseInfo',
        path: 'licenseKey',
        name: 'IP do Grafana',
        editor: LicenseStatusEditor,
        category: ['Licença'],
        defaultValue: '',
      })
      .addCustomEditor({
        id: 'zabbixDatasourceUid',
        path: 'zabbixDatasourceUid',
        name: 'Datasource Zabbix',
        description: 'Servidor consultado para status dos hosts e tráfego dos cabos.',
        editor: ZabbixDatasourceEditor,
        category: ['Fonte de dados'],
        defaultValue: undefined,
      })
      .addTextInput({
        path: 'zabbixRxItemKeyword',
        name: 'Palavra-chave RX (interface)',
        description:
          'Trecho da key Zabbix dos itens de download/entrada. Só esse termo entra na busca.',
        defaultValue: '',
        category: ['Fonte de dados'],
      })
      .addTextInput({
        path: 'zabbixTxItemKeyword',
        name: 'Palavra-chave TX (interface)',
        description:
          'Trecho da key Zabbix dos itens de upload/saída. Só esse termo entra na busca.',
        defaultValue: '',
        category: ['Fonte de dados'],
      })
      .addTextInput({
        path: 'zabbixOperStatusItemKeyword',
        name: 'Palavra-chave status (interface)',
        description:
          'Trecho da key Zabbix do status operacional da porta. Só esse termo entra na busca.',
        defaultValue: '',
        category: ['Fonte de dados'],
      })
      .addTextInput({
        path: 'zabbixSpeedItemKeyword',
        name: 'Palavra-chave capacidade (interface)',
        description:
          'Trecho da key Zabbix da velocidade/capacidade da porta. Só esse termo entra na busca.',
        defaultValue: '',
        category: ['Fonte de dados'],
      })
      .addTextInput({
        path: 'zabbixRxPowerItemKeyword',
        name: 'Palavra-chave sinal RX (interface)',
        description:
          'Trecho da key Zabbix do sinal óptico/rádio de recepção. Só esse termo entra na busca.',
        defaultValue: '',
        category: ['Fonte de dados'],
      })
      .addTextInput({
        path: 'zabbixTxPowerItemKeyword',
        name: 'Palavra-chave sinal TX (interface)',
        description:
          'Trecho da key Zabbix do sinal óptico/rádio de transmissão. Só esse termo entra na busca.',
        defaultValue: '',
        category: ['Fonte de dados'],
      })
      .addNumberInput({
        path: 'zabbixRefreshSec',
        name: 'Intervalo de atualização (segundos)',
        description: `Único timer de busca do painel (status e cabos). Hosts e problemas só na primeira carga. O auto-refresh do dashboard Grafana não consulta o Zabbix. Mínimo ${ZABBIX_DIRECT_MIN_REFRESH_SEC}s`,
        defaultValue: ZABBIX_DIRECT_DEFAULT_REFRESH_SEC,
        category: ['Fonte de dados'],
        settings: { min: ZABBIX_DIRECT_MIN_REFRESH_SEC, integer: true },
      });

    addMapSection(builder, ['Layout'], (section) => {
      section.addCustomEditor({
        id: 'mapLayout',
        path: MAP_SECTION_ROOT,
        name: 'Dimensões e JSON',
        description:
          'Largura e altura do canvas, trava de edição e importação/exportação JSON.',
        editor: TopologyLayoutEditor,
      });
    });

    builder
      .addBooleanSwitch({
        path: 'showGrid',
        name: 'Mostrar grade',
        defaultValue: false,
        category: ['Layout'],
      })
      .addNumberInput({
        path: 'gridSize',
        name: 'Tamanho da grade',
        description: 'Passo da grade em pixels (ex.: 10)',
        defaultValue: 10,
        category: ['Layout'],
      })
      .addBooleanSwitch({
        path: 'snapToGrid',
        name: 'Alinhar à grade',
        description: 'Encaixa hosts e retângulos nas linhas da grade ao mover ou redimensionar',
        defaultValue: true,
        category: ['Layout'],
      })

    addMapSection(builder, ['Hosts Zabbix'], (section) => {
      section.addCustomEditor({
        id: 'mapHosts',
        path: MAP_SECTION_ROOT,
        name: 'Hosts no mapa',
        description: 'Lista dos hosts Zabbix importados da Query. Nome e IP vêm do Zabbix.',
        editor: TopologyHostsEditor,
      });
    });

    builder
      .addCustomEditor({
        id: 'displayQueryRefIds',
        path: 'displayQueryRefIds',
        name: 'Mostrar hosts do grupo no mapa',
        editor: QueryDisplayRefIdsEditor,
        category: ['Hosts Zabbix'],
        defaultValue: undefined,
      })
      .addCustomEditor({
        id: 'templateRules',
        path: 'templateRules',
        name: 'Regras de template',
        description: 'Regras extras além das padrão (Router, OLT, Switch…).',
        editor: TopologyTemplatesEditor,
        category: ['Hosts Zabbix'],
        defaultValue: undefined,
      })

    addMapSection(builder, ['Submapas'], (section) => {
      section.addCustomEditor({
        id: 'mapSubmaps',
        path: MAP_SECTION_ROOT,
        name: 'Submapas e seletores',
        description: 'Nós de submapa e seletores de dashboard no mapa atual.',
        editor: TopologySubmapsEditor,
      });
    });

    builder
      .addCustomEditor({
        id: 'childMaps',
        path: 'childMaps',
        name: 'Mapas internos',
        description: 'Vincule nos submapas pelo campo Mapa interno.',
        editor: ChildMapsEditor,
        category: ['Submapas'],
        defaultValue: undefined,
      })

    addMapSection(builder, ['Links'], (section) => {
      section.addCustomEditor({
        id: 'mapLinks',
        path: MAP_SECTION_ROOT,
        name: 'Links entre nós',
        description: 'Cabos entre hosts, submapas e outros nós do mapa.',
        editor: TopologyLinksEditor,
      });
    });

    builder
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
        path: 'nocMode',
        name: 'Modo NOC',
        description: 'Painel de filtros e lista de equipamentos; oculta controles de edição',
        defaultValue: false,
        category: ['Interação'],
      })
      .addBooleanSwitch({
        path: 'showHostBadges',
        name: 'Badges nos hosts',
        description: 'Problemas Zabbix no canto do nó',
        defaultValue: true,
        category: ['Interação'],
      })
      .addBooleanSwitch({
        path: 'showHostAlertList',
        name: 'Lista de hosts com alerta',
        description: 'Hosts offline ou com problema Zabbix no canto inferior esquerdo',
        defaultValue: true,
        category: ['Interação'],
      })
      .addBooleanSwitch({
        path: 'showZabbixAlerts',
        name: 'Alertas do Zabbix',
        description:
          'Problemas Warning+ pintam o host, o badge e a lista. Desligado: só online e offline (lastvalue).',
        defaultValue: true,
        category: ['Interação'],
      })
      .addBooleanSwitch({
        path: 'showHostTemperature',
        name: 'Temperatura no hover',
        description:
          'Ao passar o mouse no host, mostra as temperaturas (CPU e demais sensores). Desligado por padrão.',
        defaultValue: false,
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
        name: 'Tamanho da fonte (hosts)',
        defaultValue: 11,
        category: ['Aparência'],
      })
      .addNumberInput({
        path: 'networkFontSize',
        name: 'Tamanho da fonte (redes)',
        description: 'Título da caixa de rede e texto de contagem de hosts',
        defaultValue: 11,
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorOnline',
        name: 'Cor online',
        description: 'Hosts com latência ICMP acima de 0',
        defaultValue: '#28eb0e',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorOffline',
        name: 'Cor offline',
        description: 'Hosts com latência ICMP igual a 0',
        defaultValue: '#ff0101',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorAlert',
        name: 'Cor alerta',
        description: 'Hosts com problema Zabbix (Warning+)',
        defaultValue: '#ff7300',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorUnknown',
        name: 'Cor sem dados',
        description: 'Host sem valor de latência ICMP',
        defaultValue: '#616161',
        category: ['Aparência'],
      })
      .addCustomEditor({
        id: 'hostTypeColors',
        path: 'hostTypeColors',
        name: 'Cor por tipo de host',
        description:
          'Fundo do card por tipo/ícone quando online ou sem dados (offline/alerta usam as cores globais)',
        editor: HostTypeColorsEditor,
        category: ['Aparência'],
        defaultValue: defaultHostTypeColors(),
      })
      .addColorPicker({
        path: 'colorStatic',
        name: 'Cor estático',
        description: 'Cor de fundo padrão dos rótulos estáticos (pode sobrescrever por nó)',
        defaultValue: '#8f3bb8',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorSubmap',
        name: 'Cor submapa',
        defaultValue: '#56A64B',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorLink',
        name: 'Cor base dos cabos',
        defaultValue: '#28eb0e',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorLinkDownload',
        name: 'Cor download (→ origem)',
        description: 'Seta da pílula de tráfego no sentido da origem',
        defaultValue: '#C0D8FF',
        category: ['Aparência'],
      })
      .addColorPicker({
        path: 'colorLinkUpload',
        name: 'Cor upload (→ destino)',
        description: 'Seta da pílula de tráfego no sentido do destino',
        defaultValue: '#FADE2A',
        category: ['Aparência'],
      })
      .addNumberInput({
        path: 'colorLinkWidth',
        name: 'Espessura dos cabos',
        defaultValue: 2,
        category: ['Aparência'],
      })
      .addNumberInput({
        path: 'linkUtilThresholdAttention',
        name: 'Degradação — atenção (%)',
        description: 'Acima deste valor o cabo usa a cor de atenção',
        defaultValue: 50,
        category: ['Links'],
      })
      .addColorPicker({
        path: 'colorLinkAttention',
        name: 'Cor — atenção',
        description: 'Destaque visual quando a utilização supera o limiar de atenção',
        defaultValue: '#FADE2A',
        category: ['Links'],
      })
      .addNumberInput({
        path: 'linkUtilThresholdHigh',
        name: 'Degradação — alto (%)',
        description: 'Acima deste valor o cabo usa a cor de degradado',
        defaultValue: 75,
        category: ['Links'],
      })
      .addColorPicker({
        path: 'colorLinkHigh',
        name: 'Cor — degradado',
        description: 'Destaque visual quando a utilização supera o limiar alto',
        defaultValue: '#FF9830',
        category: ['Links'],
      })
      .addNumberInput({
        path: 'linkUtilThresholdCritical',
        name: 'Degradação — crítico (%)',
        description: 'Acima deste valor o cabo usa a cor crítica (congestionamento)',
        defaultValue: 90,
        category: ['Links'],
      })
      .addColorPicker({
        path: 'colorLinkCongestion',
        name: 'Cor — crítico',
        description: 'Destaque visual quando a utilização supera o limiar crítico',
        defaultValue: '#ff7300',
        category: ['Links'],
      })
      .addBooleanSwitch({
        path: 'linkAnimationEnabled',
        name: 'Animar tráfego nos cabos',
        description: 'Traço amarelo correndo sobre a linha fina quando o cabo está online',
        defaultValue: true,
        category: ['Links'],
      })
      .addNumberInput({
        path: 'linkAnimationSpeed',
        name: 'Velocidade do tráfego',
        description: 'Multiplicador da velocidade (1 = padrão)',
        defaultValue: 0.5,
        settings: {
          min: 0.25,
          max: 4,
          step: 0.25,
        },
        category: ['Links'],
      })
      .addBooleanSwitch({
        path: 'showLegend',
        name: 'Mostrar legenda',
        description: 'Exibe a caixa de legenda no canto inferior direito do mapa',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendUnknown',
        name: 'Sem dados',
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
        path: 'legendStatic',
        name: 'Estático',
        defaultValue: false,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendSubmap',
        name: 'Submapa',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendLink',
        name: 'Cabo',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendDownload',
        name: 'Download (origem)',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendUpload',
        name: 'Upload (destino)',
        defaultValue: true,
        category: ['Legenda'],
      })
      .addBooleanSwitch({
        path: 'legendHostTypes',
        name: 'Cores por tipo de ícone',
        description: 'Lista os tipos configurados em "Ícone → cor por tipo" com a cor de cada um',
        defaultValue: true,
        category: ['Legenda'],
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
