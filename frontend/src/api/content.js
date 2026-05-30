/**
 * API: topics tree / topic / progress.
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./http";

const TREE_CACHE_KEY = "ebook_tree_cache_v1";

/** Получить дерево из sessionStorage (синхронно), если оно там есть */
export function getCachedTree() {
  try {
    const raw = sessionStorage.getItem(TREE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function fetchTree() {
  const res = await apiGet("/topics/tree", { auth: false });
  if (!res.ok) throw new Error(res.error || "tree failed");
  try { sessionStorage.setItem(TREE_CACHE_KEY, JSON.stringify(res.data)); } catch {
    /* quota */
  }
  return res.data;
}

export async function fetchTopic(slug) {
  const res = await apiGet(`/topics/${encodeURIComponent(slug)}`, { auth: false });
  if (!res.ok) throw new Error(res.error || "topic failed");
  return res.data;
}

export async function fetchMyProgress() {
  const res = await apiGet("/progress/me");
  if (!res.ok) return [];
  return res.data || [];
}

export async function fetchUserProgress(userId) {
  const res = await apiGet(`/admin/users/${userId}/progress`);
  if (!res.ok) return [];
  return res.data || [];
}

/** Расширенный прогресс: { topics: [...], questions: [...] }.
 *  topics — UserProgress (lessons + labs) + synthetic in_progress лаб с попытками.
 *  questions — производное из QuestionAnswer (done / in_progress).
 *  not_started не приходят — вычисляются на фронте как разница с tree. */
export async function fetchMyProgressFull() {
  const res = await apiGet("/progress/me/full");
  if (!res.ok) return { topics: [], questions: [] };
  return res.data || { topics: [], questions: [] };
}

export async function fetchUserProgressFull(userId) {
  const res = await apiGet(`/admin/users/${userId}/progress/full`);
  if (!res.ok) return { topics: [], questions: [] };
  return res.data || { topics: [], questions: [] };
}

export async function setProgress(topicId, status) {
  const res = await apiPut(`/progress/${topicId}`, { status });
  if (!res.ok) return null;
  return res.data;
}

// ── Admin: topics CRUD ─────────────────────────────────────

export async function fetchAllTopicsAdmin() {
  const res = await apiGet("/topics/admin/all");
  return res.ok ? res.data : [];
}

export async function createTopic(body) {
  const res = await apiPost("/topics/", body);
  if (res.ok) return { ok: true, data: res.data };
  return { ok: false, error: res.error || "Ошибка создания" };
}

export async function updateTopic(id, body) {
  const res = await apiPut(`/topics/${id}`, body);
  if (res.ok) return { ok: true, data: res.data };
  return { ok: false, error: res.error || "Ошибка сохранения" };
}

export async function deleteTopic(id) {
  const res = await apiDelete(`/topics/${id}`);
  if (res.ok) return { ok: true };
  return { ok: false, error: res.error || "Ошибка удаления" };
}
