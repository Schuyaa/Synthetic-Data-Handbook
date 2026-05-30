/**
 * API: Auth + JWT helpers.
 *
 * Токен-хелперы (isTokenExpired/clearAuth/getValidUser) намеренно живут здесь,
 * а не в http.js — чтобы избежать циклического импорта (http.js зависит от них).
 */

/* ================= TOKEN UTILS ================= */

/** Decode JWT payload (no verification — just reads exp) */
function decodePayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/** Returns true if token is missing or expired */
export function isTokenExpired(token) {
  if (!token) return true;
  const payload = decodePayload(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

/** Clear auth from localStorage and dispatch event so components react */
export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
  window.dispatchEvent(new Event("auth-expired"));
}

/** Check stored token, clear if expired. Returns user object or null. */
export function getValidUser() {
  const token = localStorage.getItem("token");
  if (isTokenExpired(token)) {
    if (token) clearAuth();
    return null;
  }
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  if (!username || !role) return null;
  return { username, role };
}

/* ================= API CALLS ================= */

import { apiGet, apiPost } from "./http";

/** Текущий пользователь по токену. Возвращает null при ошибке/401. */
export async function fetchMe() {
  const res = await apiGet("/user/me");
  return res.ok ? res.data : null;
}

/* ================= LOGIN ================= */

/**
 * Логин.
 * @returns {{ success: true, access_token, username, role } | { success: false, message?, fieldErrors? }}
 */
export async function loginUser(data) {
  const res = await apiPost("/auth/login", data, { auth: false });

  if (res.ok) {
    return { success: true, ...res.data };
  }

  // 422 — ошибки валидации Pydantic
  if (res.status === 422 && Array.isArray(res.data?.detail)) {
    const fieldErrors = {};
    res.data.detail.forEach((err) => {
      const field = err.loc?.[1];
      if (field) fieldErrors[field] = translateError(err.msg);
    });
    return { success: false, fieldErrors, message: "Ошибка валидации" };
  }

  // 400 — HTTPException с detail
  if (res.status === 400 && res.error) {
    return { success: false, message: res.error };
  }

  return { success: false, message: res.error || "Ошибка запроса" };
}

/* ================= ERROR TRANSLATION ================= */

function translateError(msg = "") {
  if (msg.includes("valid email")) return "Введите корректный адрес электронной почты";
  if (msg.includes("field required")) return "Заполните это поле";
  if (msg.includes("too short")) return "Слишком короткое значение";
  return "Некорректные данные";
}
