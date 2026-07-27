/// <reference types="vite/client" />

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.error?.message ?? 'No se pudo completar la solicitud.');
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.error?.code ?? 'REQUEST_FAILED';
    this.details = payload.error?.details ?? {};
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: HeadersInit;
  retryOnUnauthorized?: boolean;
}

export class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/v1') {}

  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  clearAccessToken(): void {
    this.accessToken = null;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { retryOnUnauthorized = true, ...requestOptions } = options;
    const response = await this.fetch(path, requestOptions);

    if (response.status === 401 && retryOnUnauthorized && await this.refresh()) {
      return this.request<T>(path, { ...requestOptions, retryOnUnauthorized: false });
    }

    return this.read<T>(response);
  }

  async refresh(): Promise<boolean> {
    if (!this.refreshPromise) this.refreshPromise = this.refreshAccessToken();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const response = await this.fetch('/auth/refresh', {
        method: 'POST',
        body: { clientType: 'web' },
      });

      if (!response.ok) {
        this.clearAccessToken();
        return false;
      }

      const body = await this.read<{ accessToken: string }>(response);
      this.setAccessToken(body.accessToken);
      return true;
    } catch {
      this.clearAccessToken();
      return false;
    }
  }

  private async fetch(path: string, options: Omit<RequestOptions, 'retryOnUnauthorized'>): Promise<Response> {
    const headers = new Headers(options.headers);
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    if (options.body !== undefined) headers.set('content-type', 'application/json');

    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      headers,
    });
  }

  private async read<T>(response: Response): Promise<T> {
    const body = await response.json() as T & ApiErrorPayload;
    if (!response.ok) throw new ApiError(response.status, body);
    return body;
  }
}
