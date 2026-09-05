import { grafanaFetch } from './grafanaFetch';

export type ZabbixParams = Record<string, unknown>;

type ZabbixEnvelope<T> = {
  result?: T;
  error?: { message?: string } | string;
};

export function unwrapZabbixResult<T>(data: T | ZabbixEnvelope<T>): T {
  if (data && typeof data === 'object') {
    const rec = data as ZabbixEnvelope<T>;
    if (rec.error) {
      const msg = typeof rec.error === 'string' ? rec.error : rec.error.message;
      throw new Error(msg?.trim() || 'Falha ao consultar o Zabbix.');
    }
    if (Object.prototype.hasOwnProperty.call(rec, 'result') && rec.result !== undefined) {
      return rec.result;
    }
  }
  return data as T;
}

/** JSON-RPC do grafana-zabbix — a sessão do browser autentica o proxy. */
let zabbixCallSeq = 0;

export async function zabbixCall<T>(
  datasourceUid: string,
  method: string,
  params: ZabbixParams
): Promise<T> {
  const uid = datasourceUid.trim();
  if (!uid) {
    throw new Error('Datasource Zabbix não configurado.');
  }
  zabbixCallSeq += 1;
  const seq = zabbixCallSeq;
  try {
    const data = await grafanaFetch<T | ZabbixEnvelope<T>>({
      url: `/api/datasources/uid/${encodeURIComponent(uid)}/resources/zabbix-api`,
      method: 'POST',
      data: { method, params },
      requestId: `luminous-topology:${uid}:${method}:${seq}`,
    });
    return unwrapZabbixResult(data);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      throw new Error('Grafana recusou a sessão ao consultar o Zabbix.');
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Falha ao consultar o Zabbix.');
  }
}

export type ZabbixRpc = typeof zabbixCall;
