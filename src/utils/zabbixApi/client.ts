import { getBackendSrv } from '@grafana/runtime';

interface ZabbixApiResponse<T> {
  result?: T;
  error?: { message?: string };
}

export const ZABBIX_CALL_TIMEOUT_MS = 15_000;
/**
 * Teto para a chamada única de status, que cobre todos os hosts dos grupos de uma vez. Ela tem
 * payload maior que as demais e não tem para onde ser dividida sem voltar a somar round-trips.
 */
export const ZABBIX_STATUS_CALL_TIMEOUT_MS = 45_000;

/** Opções extras da chamada Zabbix — cancelamento e silêncio de toast em polling. */
export interface ZabbixCallOptions {
  abortSignal?: AbortSignal;
  /** Cancela a requisição anterior com o mesmo id no BackendSrv do Grafana. */
  requestId?: string;
  showErrorAlert?: boolean;
}

/** Requisição abortada pelo Grafana/React, timeout ou queda momentânea de rede — não é falha permanente. */
export function isBenignZabbixFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|context canceled|context cancelled|abort|request was aborted|network error|networkerror|timeout/i.test(
    msg
  );
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw new Error('abort');
  }
}

export async function zabbixCall<T>(
  datasourceUid: string,
  method: string,
  params: object,
  timeoutMs = ZABBIX_CALL_TIMEOUT_MS,
  callOptions: ZabbixCallOptions = {}
): Promise<T> {
  throwIfAborted(callOptions.abortSignal);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();
  if (callOptions.abortSignal) {
    callOptions.abortSignal.addEventListener('abort', abortFromParent, { once: true });
  }

  let response: ZabbixApiResponse<T> | T;
  try {
    response = await getBackendSrv().post<ZabbixApiResponse<T> | T>(
      `/api/datasources/uid/${datasourceUid}/resources/zabbix-api`,
      { method, params },
      {
        abortSignal: controller.signal,
        showErrorAlert: callOptions.showErrorAlert ?? false,
        requestId: callOptions.requestId,
      }
    );
  } catch (err) {
    if (isBenignZabbixFetchError(err)) {
      throw err;
    }
    throw new Error('Falha ao consultar o Zabbix.');
  } finally {
    window.clearTimeout(timer);
    callOptions.abortSignal?.removeEventListener('abort', abortFromParent);
  }

  if (response && typeof response === 'object' && 'error' in response && response.error) {
    throw new Error(response.error.message ?? 'Falha ao consultar o Zabbix.');
  }
  if (response && typeof response === 'object' && 'result' in response) {
    return (response as ZabbixApiResponse<T>).result as T;
  }
  return response as T;
}
