const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const AUTH_TOKEN_KEY = "bm_auth_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") detail = body.detail;
    else if (Array.isArray(body?.detail)) {
      // FastAPI validation errors → flatten into readable string
      detail = body.detail
        .map((e: { loc?: string[]; msg?: string }) =>
          [e.loc?.slice(1).join("."), e.msg].filter(Boolean).join(": "),
        )
        .join(" | ");
    }
  } catch {
    // body was not JSON
  }
  return new ApiError(res.status, detail);
}

function clearAuthAndRedirect() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_TOKEN_KEY}=; path=/; max-age=0`;
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") {
      clearAuthAndRedirect();
    }
    throw await parseError(res);
  }

  // 204 No Content — nothing to parse
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}
