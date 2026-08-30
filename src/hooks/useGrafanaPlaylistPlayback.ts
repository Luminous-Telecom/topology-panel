import { locationService } from '@grafana/runtime';
import {
  documentHasPlaylistControls,
  searchIndicatesPlaylistPlayback,
} from '../utils/grafanaPlaylist';
import { useGrafanaChromeFlag } from './useGrafanaChromeFlag';

function readPlaylistPlayback(): boolean {
  try {
    if (searchIndicatesPlaylistPlayback(locationService.getSearchObject())) {
      return true;
    }
  } catch {
    // locationService pode falhar fora do Grafana — trata como não-playlist.
  }
  if (typeof document === 'undefined') {
    return false;
  }
  return documentHasPlaylistControls(document);
}

/**
 * True enquanto uma lista de reprodução Grafana está tocando (ou o dashboard
 * está em kiosk/autofit). Usado para esconder a toolbar do mapa na TV;
 * navegação de submapa, legenda e lista de alertas continuam.
 *
 * Detecta pelos query params oficiais (`locationService`) e, no modo Normal
 * da playlist (sem `kiosk` na URL), pelos botões nativos — o Grafana não
 * expõe `playlistSrv` para plugins.
 */
export function useGrafanaPlaylistPlayback(): boolean {
  return useGrafanaChromeFlag(readPlaylistPlayback);
}
