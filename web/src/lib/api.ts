/** Cliente de la API. Las escrituras llevan `X-Dev-Panel: 1`, que el servidor exige. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
  }
}

const request = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: {
      ...(method !== 'GET' ? { 'X-Dev-Panel': '1' } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError((data as { error?: string } | null)?.error ?? `Error ${response.status}`, response.status, data);
  return data as T;
};

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};
