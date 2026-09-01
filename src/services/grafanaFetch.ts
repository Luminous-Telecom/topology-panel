import { getBackendSrv } from '@grafana/runtime';

export function grafanaFetch<T>(request: {
  url: string;
  method?: string;
  data?: unknown;
  params?: Record<string, string>;
  abortSignal?: AbortSignal;
  requestId?: string;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    getBackendSrv()
      .fetch<T>({
        url: request.url,
        method: request.method ?? 'GET',
        data: request.data,
        params: request.params,
        showErrorAlert: false,
        hideFromInspector: true,
        ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
        ...(request.requestId ? { requestId: request.requestId } : {}),
      })
      .subscribe({
        next: (response) => resolve(response.data),
        error: reject,
      });
  });
}
