import { describe, expect, it } from 'vitest';
import { nextHistoryTimeFromSec, ZABBIX_HOVER_HISTORY_PAGE_LIMIT } from './zabbixApi';

describe('nextHistoryTimeFromSec', () => {
  it('página incompleta encerra a paginação — já veio o fim da janela', () => {
    const page = [{ clockSec: 100 }, { clockSec: 130 }];
    expect(nextHistoryTimeFromSec(page, 500)).toBeUndefined();
  });

  it('página cheia continua no segundo seguinte ao último clock', () => {
    const page = [];
    for (let i = 0; i < ZABBIX_HOVER_HISTORY_PAGE_LIMIT; i += 1) {
      page.push({ clockSec: 1_700_000_000 + i * 30 });
    }
    expect(nextHistoryTimeFromSec(page)).toBe(page[page.length - 1].clockSec + 1);
  });

  it('página vazia não avança', () => {
    expect(nextHistoryTimeFromSec([])).toBeUndefined();
  });
});
