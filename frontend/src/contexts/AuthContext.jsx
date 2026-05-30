/**
 * AuthContext — единая точка хранения текущего пользователя.
 *
 * Источники правды:
 *  - localStorage (token/username/role) — моментальный snapshot при старте,
 *    используется в SiteHeader до ответа бэка
 *  - /user/me — проверка токена на живость; перезапрашивается после login и при
 *    mount'е провайдера
 *
 * Слушает событие "auth-expired" (бросается из api/http.js при 401) и
 * сбрасывает пользователя.
 */

import { useEffect, useState, useCallback } from "react";
import { getValidUser, clearAuth, fetchMe } from "../api/auth";
import { AuthContext } from "./authContextObject";

export function AuthProvider({ children }) {
  // moментальный snapshot из localStorage — чтобы UI не мигал
  const [user, setUser] = useState(() => getValidUser());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getValidUser()) {
      setUser(null);
      setReady(true);
      return null;
    }
    const data = await fetchMe();
    if (!data) {
      clearAuth();
      setUser(null);
      setReady(true);
      return null;
    }
    const next = { username: data.username, role: data.role, ...data };
    setUser(next);
    setReady(true);
    return next;
  }, []);

  // При монтировании — сверить с сервером.
  // Паттерн legitimate: подписка на внешний источник (localStorage/сервер),
  // поэтому react-hooks/set-state-in-effect глушим локально.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // При событии истечения токена (из http.js) — сбросить
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  /**
   * Вызывается после успешного логина из модалки.
   * Сохраняет токен и метаданные в localStorage,
   * затем синкает с бэком через /user/me, чтобы получить полный объект.
   */
  const loginSuccess = useCallback(async ({ access_token, username, role }) => {
    localStorage.setItem("token", access_token);
    localStorage.setItem("username", username);
    localStorage.setItem("role", role);
    await refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, ready, refresh, logout, loginSuccess }}>
      {children}
    </AuthContext.Provider>
  );
}
