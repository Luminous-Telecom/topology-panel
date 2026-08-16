import { describe, expect, it } from 'vitest';
import {
  documentHasPlaylistControls,
  isTruthyUrlFlag,
  searchIndicatesPlaylistPlayback,
} from './grafanaPlaylist';

describe('isTruthyUrlFlag', () => {
  it('aceita true, string vazia (?kiosk) e kiosk=tv', () => {
    expect(isTruthyUrlFlag(true)).toBe(true);
    expect(isTruthyUrlFlag('')).toBe(true);
    expect(isTruthyUrlFlag('tv')).toBe(true);
    expect(isTruthyUrlFlag('true')).toBe(true);
    expect(isTruthyUrlFlag(1)).toBe(true);
  });

  it('rejeita false, null e off', () => {
    expect(isTruthyUrlFlag(false)).toBe(false);
    expect(isTruthyUrlFlag(null)).toBe(false);
    expect(isTruthyUrlFlag(undefined)).toBe(false);
    expect(isTruthyUrlFlag('false')).toBe(false);
    expect(isTruthyUrlFlag('0')).toBe(false);
    expect(isTruthyUrlFlag('off')).toBe(false);
  });
});

describe('searchIndicatesPlaylistPlayback', () => {
  it('é falso numa URL de dashboard comum (só orgId)', () => {
    expect(searchIndicatesPlaylistPlayback({ orgId: '1' })).toBe(false);
    expect(searchIndicatesPlaylistPlayback({})).toBe(false);
  });

  it('detecta kiosk e autofit da lista de reprodução', () => {
    expect(searchIndicatesPlaylistPlayback({ kiosk: true })).toBe(true);
    expect(searchIndicatesPlaylistPlayback({ kiosk: 'tv' })).toBe(true);
    expect(searchIndicatesPlaylistPlayback({ autofitpanels: true })).toBe(true);
    expect(searchIndicatesPlaylistPlayback({ '_dash.hidePlaylistNav': true })).toBe(true);
  });
});

describe('documentHasPlaylistControls', () => {
  it('é falso sem os botões nativos da playlist', () => {
    const root = document.createElement('div');
    expect(documentHasPlaylistControls(root)).toBe(false);
    expect(documentHasPlaylistControls(null)).toBe(false);
  });

  it('detecta o botão Stop da playlist pelo data-testid do Grafana', () => {
    const root = document.createElement('div');
    const stop = document.createElement('button');
    stop.setAttribute('data-testid', 'data-testid playlist stop dashboard button');
    root.appendChild(stop);
    expect(documentHasPlaylistControls(root)).toBe(true);
  });
});
