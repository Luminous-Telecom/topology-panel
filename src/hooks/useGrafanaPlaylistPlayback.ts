import { useEffect, useState } from 'react';
import { locationService } from '@grafana/runtime';
import {
  documentHasPlaylistControls,
  searchIndicatesPlaylistPlayback,
} from '../utils/grafanaPlaylist';

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
 * está em kiosk/autofit). Usado para esconder a toolbar do mapa na TV.
 *
 * Detecta pelos query params oficiais (`locationService`) e, no modo Normal
 * da playlist (sem `kiosk` na URL), pelos botões nativos — o Grafana não
 * expõe `playlistSrv` para plugins.
 */
export function useGrafanaPlaylistPlayback(): boolean {
  const [playing, setPlaying] = useState(() => readPlaylistPlayback());

  useEffect(() => {
    const sync = () => {
      setPlaying(readPlaylistPlayback());
    };
    sync();

    let unlisten: (() => void) | undefined;
    try {
      unlisten = locationService.getHistory().listen(sync);
    } catch {
      unlisten = undefined;
    }

    if (typeof document === 'undefined') {
      return () => {
        unlisten?.();
      };
    }

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      unlisten?.();
      observer.disconnect();
    };
  }, []);

  return playing;
}
