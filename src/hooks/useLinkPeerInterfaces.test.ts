import { describe, expect, it } from 'vitest';
import { combinePeerInterfaceLoadError } from './useLinkPeerInterfaces';
import { NO_API_ITEMS_ERROR } from './useZabbixHostInterfaces';

describe('combinePeerInterfaceLoadError', () => {
  it('não alerta quando um extremo tem interfaces e o outro está vazio', () => {
    expect(
      combinePeerInterfaceLoadError({
        fromCount: 0,
        toCount: 40,
        loading: false,
        queriedBoth: true,
      })
    ).toBeUndefined();
  });

  it('alerta só quando os dois extremos já foram consultados e vieram vazios', () => {
    expect(
      combinePeerInterfaceLoadError({
        fromCount: 0,
        toCount: 0,
        loading: false,
        queriedBoth: true,
      })
    ).toBe(NO_API_ITEMS_ERROR);
  });

  it('não alerta enquanto a consulta ainda está em andamento', () => {
    expect(
      combinePeerInterfaceLoadError({
        fromCount: 0,
        toCount: 0,
        loading: true,
        queriedBoth: false,
      })
    ).toBeUndefined();
  });

  it('propaga falha real da API', () => {
    expect(
      combinePeerInterfaceLoadError({
        fromError: 'Não foi possível consultar as interfaces deste host no Zabbix.',
        fromCount: 0,
        toCount: 40,
        loading: false,
        queriedBoth: true,
      })
    ).toBe('Não foi possível consultar as interfaces deste host no Zabbix.');
  });
});
