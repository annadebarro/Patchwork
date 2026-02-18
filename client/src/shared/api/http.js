export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const SESSION_ID_STORAGE_KEY = "pw.session.id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const REQUEST_SURFACES = Object.freeze({
  SOCIAL_FEED: "social_feed",
  POST_DETAIL: "post_detail",
  PROFILE: "profile",
  SEARCH_RESULTS: "search_results",
  UNKNOWN: "unknown",
});
const ALLOWED_REQUEST_SURFACES = new Set(Object.values(REQUEST_SURFACES));

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback UUID-like value if randomUUID is unavailable.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getOrCreateSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  let storage;
  try {
    storage = window.sessionStorage;
  } catch {
    return null;
  }

  const existing = storage.getItem(SESSION_ID_STORAGE_KEY);
  if (existing && UUID_RE.test(existing)) {
    return existing;
  }

  const created = createUuid();
  if (!UUID_RE.test(created)) {
    return null;
  }

  try {
    storage.setItem(SESSION_ID_STORAGE_KEY, created);
  } catch {
    return null;
  }

  return created;
}

function normalizeRequestSurface(surface) {
  if (typeof surface !== "string") return REQUEST_SURFACES.UNKNOWN;
  const normalized = surface.trim().toLowerCase();
  if (!normalized) return REQUEST_SURFACES.UNKNOWN;
  return ALLOWED_REQUEST_SURFACES.has(normalized) ? normalized : REQUEST_SURFACES.UNKNOWN;
}

function getStoredToken() {
  if (typeof window === "undefined") return null;
  try {
    const token = window.localStorage.getItem("token");
    return typeof token === "string" && token.trim() ? token : null;
  } catch {
    return null;
  }
}

function toApiUrl(pathOrUrl) {
  if (typeof pathOrUrl !== "string" || !pathOrUrl.trim()) {
    throw new Error("apiFetch requires a non-empty path string.");
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function buildRequestHeaders({ surface, headers, includeAuth = false, token } = {}) {
  const requestHeaders = new Headers(headers || {});
  requestHeaders.set("x-pw-surface", normalizeRequestSurface(surface));

  const sessionId = getOrCreateSessionId();
  if (sessionId) {
    requestHeaders.set("x-pw-session-id", sessionId);
  }

  const resolvedToken = typeof token === "string" && token.trim()
    ? token
    : includeAuth
      ? getStoredToken()
      : null;
  if (resolvedToken && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${resolvedToken}`);
  }

  return requestHeaders;
}

export async function apiFetch(pathOrUrl, options = {}) {
  const {
    surface = REQUEST_SURFACES.UNKNOWN,
    auth = false,
    token,
    headers,
    ...fetchOptions
  } = options;

  return fetch(toApiUrl(pathOrUrl), {
    ...fetchOptions,
    headers: buildRequestHeaders({
      surface,
      headers,
      includeAuth: auth,
      token,
    }),
  });
}

export function buildTelemetryHeaders(surface) {
  return Object.fromEntries(
    buildRequestHeaders({ surface }).entries()
  );
}

export async function parseApiResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await res.json();
    } catch (err) {
      console.error("Failed to parse JSON response", err);
      return null;
    }
  }

  try {
    const text = await res.text();
    return text ? { message: text } : null;
  } catch (err) {
    console.error("Failed to read response body", err);
    return null;
  }
}
