import { describe, expect, it } from 'vitest';
import { isBenignZabbixFetchError } from './zabbixApi';

describe('isBenignZabbixFetchError', () => {
  it('reconhece abort e falha de rede', () => {
    expect(isBenignZabbixFetchError(new Error('Failed to fetch'))).toBe(true);
    expect(isBenignZabbixFetchError(new Error('The user aborted a request'))).toBe(true);
    expect(isBenignZabbixFetchError(new Error('NetworkError when attempting to fetch resource'))).toBe(
      true
    );
  });

  it('reconhece timeout para o poll não ficar preso em requisição pendente', () => {
    expect(isBenignZabbixFetchError(new Error('timeout'))).toBe(true);
  });

  it('não trata erro de API como transitório', () => {
    expect(isBenignZabbixFetchError(new Error('Falha ao consultar o Zabbix.'))).toBe(false);
  });
});
