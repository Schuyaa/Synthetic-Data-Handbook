/**
 * Labs API. CRUD самой лабы — через /topics/ (см. content.js).
 * Тут только lab-специфика: options, check, history.
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./http";


// ── Public / Student ──

export async function fetchLabPublic(labId) {
  // Опциональный auth: анонимы видят метаданные, залогиненные получают
  // дополнительно starter_code/test_code (для python_code). См. бэк
  // routers/labs.py::get_lab_public + utils.py::get_optional_user.
  const res = await apiGet(`/labs/${labId}/public`);
  return res.ok ? res.data : null;
}

/**
 * → { is_correct, attempts_used, attempts_left, submitted_at, detail? }
 *
 * @param {number} labId
 * @param {string} answer — для python_code: сам код пользователя; для остальных — как раньше
 * @param {object} [opts]
 * @param {boolean|null} [opts.clientVerifiedCorrect=null] — только для python_code (v1):
 *   результат проверки на клиенте через Pyodide. Бэк доверяет этому флагу.
 *   Для других режимов — игнорируется бэком.
 */
export async function submitLabAnswer(labId, answer, opts = {}) {
  const body = { answer };
  if (opts.clientVerifiedCorrect != null) {
    body.client_verified_correct = !!opts.clientVerifiedCorrect;
  }
  const res = await apiPost(`/labs/${labId}/check`, body);
  return res.ok ? res.data : null;
}

export async function fetchMyLabSubmissions(labId) {
  const res = await apiGet(`/labs/${labId}/my-submissions`);
  return res.ok ? res.data : [];
}


// ── Admin / Teacher ──

export async function fetchLabAdmin(labId) {
  const res = await apiGet(`/labs/${labId}/admin`);
  return res.ok ? res.data : null;
}

export async function createLabOption(labId, body) {
  const res = await apiPost(`/labs/${labId}/options`, body);
  return res.ok ? res.data : null;
}

export async function updateLabOption(labId, optionId, body) {
  const res = await apiPut(`/labs/${labId}/options/${optionId}`, body);
  return res.ok ? res.data : null;
}

export async function deleteLabOption(labId, optionId) {
  const res = await apiDelete(`/labs/${labId}/options/${optionId}`);
  return res.ok;
}
