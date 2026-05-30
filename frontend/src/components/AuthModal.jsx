import { useState, useEffect, useRef, useCallback } from "react";
import { loginUser } from "../api/auth";

export default function AuthModal({ onClose, onAuthSuccess }) {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [closing, setClosing] = useState(false);
  const cardRef = useRef(null);

  // useCallback — чтобы identity функции была стабильной между рендерами,
  // пока не меняется onClose. Иначе ESC-listener в useEffect ниже пришлось
  // бы переподписывать на каждом рендере (или не указывать animatedClose
  // в deps и ловить warning react-hooks/exhaustive-deps).
  const animatedClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // ================= ESC CLOSE =================
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") animatedClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [animatedClose]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: null });
  };

  const handleOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget) animatedClose();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");
    setErrors({});

    const res = await loginUser({
      login: form.login,
      password: form.password,
    });

    if (res.success) {
      // Передаём весь ответ наверх (AuthContext.loginSuccess сохранит в localStorage)
      await onAuthSuccess({
        access_token: res.access_token,
        username: res.username,
        role: res.role,
      });
      onClose();
    } else {
      setMessage(res.message);
    }
  };

  return (
    <div className={`modal-overlay${closing ? " modal-closing" : ""}`} onMouseDown={handleOverlayMouseDown}>
      <div
        className="modal-card"
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={animatedClose}>
          ×
        </button>

        <h2 style={{ margin: "0 0 18px", fontSize: 20 }}>Вход</h2>

        <form onSubmit={handleLogin}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-login">Логин или email</label>
            <input
              id="auth-login"
              name="login"
              placeholder="Имя пользователя или email"
              onChange={handleChange}
              className={errors.login ? "input-error" : ""}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Пароль</label>
            <div className="pwd-wrap">
              <input
                id="auth-password"
                type={showPwd ? "text" : "password"}
                name="password"
                placeholder="Введите пароль"
                onChange={handleChange}
                className={errors.password ? "input-error" : ""}
                required
              />
              <button
                type="button"
                className="pwd-toggle"
                onClick={() => setShowPwd((v) => !v)}
                tabIndex={-1}
                aria-label={showPwd ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPwd ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary">
            Войти
          </button>
        </form>

        {message && <div className="message">{message}</div>}
      </div>
    </div>
  );
}
