/**
 * Единая точка HTTP. Все api/*.js → через apiRequest().
 * Автоматика: Authorization-header, 401 → clearAuth + событие auth-expired,
 * формат ответа { ok, status, data, error }, поддержка AbortSignal.
 */

import { isTokenExpired, clearAuth } from "./auth";

// Fail-fast: без VITE_API_URL модуль падает при импорте, не молча уходит на localhost.
// Vite автоматически грузит .env.[mode] для dev (.env.development) и build (.env.production).
const _rawApiUrl = import.meta.env.VITE_API_URL;
if (!_rawApiUrl || typeof _rawApiUrl !== "string" || !_rawApiUrl.trim()) {
  throw new Error(
    "VITE_API_URL не задана. См. frontend/.env.development или " +
    "frontend/.env.production.example."
  );
}
// strip trailing / чтобы не было двойного слэша
export const API_URL = _rawApiUrl.trim().replace(/\/+$/, "");

function readToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  if (isTokenExpired(token)) {
    clearAuth();
    return null;
  }
  return token;
}

/**
 * @param {string} path — путь без базы (например, "/topics/tree")
 * @param {object} [opts]
 * @param {"GET"|"POST"|"PUT"|"DELETE"|"PATCH"} [opts.method="GET"]
 * @param {any} [opts.body] — JSON сериализуется автоматически
 * @param {boolean} [opts.auth=true] — добавить Authorization header
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ ok: boolean, status: number, data?: any, error?: string }>}
 */
export async function apiRequest(path, opts = {}) {
  const { method = "GET", body, auth = true, signal } = opts;

  const headers = {};
  let fetchBody;
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  if (auth) {
    const token = readToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: fetchBody, signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, status: 0, error: "aborted" };
    }
    return { ok: false, status: 0, error: "Ошибка соединения с сервером" };
  }

  if (res.status === 401) {
    clearAuth();
  }

  let data;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { data = await res.json(); } catch { data = null; }
  } else {
    try { data = await res.text(); } catch { data = null; }
  }

  if (!res.ok) {
    const error =
      (data && typeof data === "object" && (data.detail || data.message))
      || (typeof data === "string" && data)
      || `Ошибка ${res.status}`;
    return { ok: false, status: res.status, error, data };
  }

  return { ok: true, status: res.status, data };
}

// ─── Сахарные обёртки ─────────────────────────────────────────

export const apiGet = (path, opts) => apiRequest(path, { ...opts, method: "GET" });
export const apiPost = (path, body, opts) => apiRequest(path, { ...opts, method: "POST", body });
export const apiPut = (path, body, opts) => apiRequest(path, { ...opts, method: "PUT", body });
export const apiDelete = (path, opts) => apiRequest(path, { ...opts, method: "DELETE" });
