import { apiGet, apiPost, apiPut, apiDelete } from "./http";

/** Список всех групп */
export async function fetchGroups() {
  const res = await apiGet("/groups", { auth: false });
  return res.ok ? res.data : [];
}

/** Создать группу (admin/teacher) */
export async function createGroup(name, course = null) {
  const res = await apiPost("/groups", { name, course });
  if (res.ok) return res.data;
  return { error: res.error || "Ошибка создания группы" };
}

/** Обновить группу (name и/или course). Поля опциональны. */
export async function updateGroup(id, patch) {
  const res = await apiPut(`/groups/${id}`, patch);
  if (res.ok) return res.data;
  return { error: res.error || "Ошибка обновления группы" };
}

/** Удалить группу */
export async function deleteGroup(id) {
  const res = await apiDelete(`/groups/${id}`);
  return res.ok;
}

/** Прогресс группы: средний % и разбивка по юзерам */
export async function fetchGroupProgress(id) {
  const res = await apiGet(`/groups/${id}/progress`);
  return res.ok ? res.data : null;
}
