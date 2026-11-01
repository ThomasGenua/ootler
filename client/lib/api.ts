export type { AuthUser, PublicConfig, AdminOverview as Overview, DemoData } from '../../shared/contracts';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'We could not reach Ootla. Check your connection and try again.');
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new ApiError(response.status, 'Ootla returned an unexpected response. Please try again.');
  const body: unknown = await response.json();
  if (!response.ok) {
    const result = body as { error?: string | { message?: string }; message?: string };
    const message = typeof result.error === 'string' ? result.error : result.error?.message ?? result.message;
    throw new ApiError(response.status, message || 'Something went wrong. Please try again.');
  }
  return body as T;
}
export function errorMessage(error: unknown): string {
  const message=error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  return typeof document!=='undefined'&&document.body.matches('.admin-body,.login-body,.staff-access-body')?staffCopy(message):message;
}

/** Display copy for system notices; never apply to customer messages or record bodies. */
export const staffCopy=(text:string)=>text.replace(/not configured/gi,'not connected').replace(/requires configuration/gi,'needs setup').replace(/unavailable/gi,'not ready').replace(/simulated/gi,'test');
