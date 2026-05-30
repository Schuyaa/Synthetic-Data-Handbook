import { apiGet, apiPost, apiPut, apiDelete } from "./http";

/** Все пользователи (admin/teacher) */
export async function fetchAllUsers() {
  const res = await apiGet("/admin/users");
  return res.ok ? res.data : [];
}

/** Создать пользователя (admin: любая роль, teacher: только student) */
export async function createUser(body) {
  const res = await apiPost("/admin/users", body);
  if (res.ok) return res.data;
  return { error: res.error || "Ошибка создания пользователя" };
}

/** Обновить поля пользователя (email / first_name / last_name) */
export async function updateUserFields(userId, patch) {
  const res = await apiPut(`/admin/users/${userId}`, patch);
  if (res.ok) return res.data;
  return { error: res.error || "Ошибка обновления пользователя" };
}

/** Сменить роль (только admin) */
export async function updateUserRole(userId, role) {
  const res = await apiPut(`/admin/users/${userId}/role`, { role });
  if (res.ok) return true;
  return { error: res.error || "Ошибка обновления роли" };
}

/** Сменить группу */
export async function updateUserGroup(userId, groupId) {
  const res = await apiPut(`/admin/users/${userId}/group`, { group_id: groupId || null });
  if (res.ok) return true;
  return { error: res.error || "Ошибка обновления группы" };
}

/** Удалить пользователя (только admin) */
export async function deleteUser(userId) {
  const res = await apiDelete(`/admin/users/${userId}`);
  return res.ok;
}
