import { describe, expect, it } from 'vitest';
import { queryRefBadgeLabel, queryRefRowTitle } from './queryRefLabel';

describe('queryRefBadgeLabel', () => {
  it('usa o último segmento de refIds com barra', () => {
    expect(queryRefBadgeLabel('DUDE/MAPA/APD')).toBe('APD');
    expect(queryRefBadgeLabel('DUDE/MAPA/SEPS')).toBe('SEPS');
  });

  it('mantém refIds curtos inteiros', () => {
    expect(queryRefBadgeLabel('A')).toBe('A');
    expect(queryRefBadgeLabel('APD')).toBe('APD');
  });
});

describe('queryRefRowTitle', () => {
  it('mostra o nome do grupo Zabbix quando o hint é de modo direto', () => {
    expect(queryRefRowTitle('DUDE/MAPA/APD', 'Grupo Zabbix: Dude/Mapa/APD')).toBe('Dude/Mapa/APD');
  });

  it('mantém o prefixo Consulta no modo query', () => {
    expect(queryRefRowTitle('APD', 'Host group Apodi')).toBe('Consulta APD');
  });
});
