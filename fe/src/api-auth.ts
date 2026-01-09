const TOKEN_PARAM = "token";
const TOKEN_STORAGE_KEY = "pdit.token";

function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(TOKEN_PARAM);
}

function stripTokenFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(TOKEN_PARAM)) {
    return;
  }
  url.searchParams.delete(TOKEN_PARAM);
  const newUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", newUrl);
}

export function getAuthToken(): string | null {
  const urlToken = getTokenFromUrl();
  if (urlToken) {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored != urlToken) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, urlToken);
    }
    stripTokenFromUrl();
    return urlToken;
  }

  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function addAuthHeaders(headers?: HeadersInit): HeadersInit {
  const token = getAuthToken();
  if (!token) {
    return headers ?? {};
  }

  const merged = new Headers(headers ?? {});
  merged.set("X-PDIT-Token", token);
  return merged;
}

export function withAuthQuery(url: string): string {
  const token = getAuthToken();
  if (!token) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}
