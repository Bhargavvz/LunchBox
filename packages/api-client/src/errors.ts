/** RFC 7807 problem document as returned by the LunchBox API. */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: { field: string; message: string }[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: { field: string; message: string }[];
  readonly retryAfterSeconds?: number;

  constructor(status: number, problem: Problem | undefined, retryAfterSeconds?: number) {
    super(problem?.detail ?? ApiError.defaultMessage(status));
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? `http_${status}`;
    this.fieldErrors = problem?.errors ?? [];
    this.retryAfterSeconds = retryAfterSeconds;
  }

  static async fromResponse(response: Response, parsed?: unknown): Promise<ApiError> {
    let problem: Problem | undefined;
    if (parsed && typeof parsed === 'object') {
      problem = parsed as Problem;
    } else {
      try {
        problem = (await response.clone().json()) as Problem;
      } catch {
        problem = undefined;
      }
    }
    const retry = response.headers.get('Retry-After');
    return new ApiError(response.status, problem, retry ? Number(retry) : undefined);
  }

  /** True for errors worth retrying later (offline queue): network, 5xx, 429, 409 request-in-progress. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429 || this.code === 'request_in_progress';
  }

  static defaultMessage(status: number): string {
    if (status === 0) return 'No internet connection. We will retry automatically.';
    if (status === 401) return 'Please sign in again.';
    if (status === 403) return 'You do not have access to this.';
    if (status === 404) return 'Not found.';
    if (status === 429) return 'Too many attempts. Please wait a moment.';
    if (status >= 500) return 'Something went wrong on our side. Please try again.';
    return 'The request could not be completed.';
  }
}

export class NetworkError extends ApiError {
  constructor(cause: unknown) {
    super(0, { code: 'network_error', detail: ApiError.defaultMessage(0) });
    this.cause = cause;
  }
}
