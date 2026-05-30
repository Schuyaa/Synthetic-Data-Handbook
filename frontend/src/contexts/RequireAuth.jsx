/**
 * RequireAuth — обёртка для защищённых роутов.
 *
 * Пока AuthContext ещё не проверил токен — показывает fallback (или ничего),
 * чтобы страница не мигала и не делала ложных редиректов.
 *
 * Если пользователь не авторизован или его роль не попадает в allowed,
 * редиректит на "/".
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function RequireAuth({ roles, children, fallback = null }) {
  const { user, ready } = useAuth();

  if (!ready) return fallback;

  if (!user) return <Navigate to="/" replace />;

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
