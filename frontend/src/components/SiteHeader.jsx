import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { searchApi } from "../api/search";
import { useTheme } from "../contexts/useTheme";
import { sanitizeSnippet } from "../utils/sanitize";
import { extractFirstMark } from "../utils/search";

export default function SiteHeader({ user, onLoginClick, onLogout }) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const popRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const menuRef = useRef(null);

  // закрывать поповер кликом снаружи
  useEffect(() => {
    const onDoc = (e) => {
      if (open) {
        const pop = popRef.current;
        const inp = inputRef.current;
        if (pop && pop.contains(e.target)) return;
        if (inp && inp.contains(e.target)) return;
        setOpen(false);
      }
      if (menuOpen) {
        const menu = menuRef.current;
        if (menu && menu.contains(e.target)) return;
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, menuOpen]);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const runSearch = (value) => {
    setQ(value);
    const v = value.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!v) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchApi(v, 20);
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const goTo = (r) => {
    setOpen(false);
    setQ("");
    setResults([]);

    if (r.target === "theme") {
      navigate("/");
      setTimeout(() => {
        const el = document.getElementById(`part-${r.slug}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return;
    }

    // Достаём первое <mark>...</mark>-слово из FTS-сниппета — это ровно тот
    // токен, который PG-FTS сматчил (со stemming-окончанием). Передаём его
    // как ?match=... — на странице оно подсветится и приземлит scroll туда же.
    const match = extractFirstMark(r.snippet);
    const matchParam = match ? `match=${encodeURIComponent(match)}` : "";

    if (r.target === "chapter") {
      const qs = matchParam ? `?${matchParam}` : "";
      navigate(`/chapter/${r.slug}${qs}`);
      return;
    }

    if (r.target === "lesson" && r.chapter_slug) {
      const qs = `?lesson=${encodeURIComponent(r.slug)}${matchParam ? "&" + matchParam : ""}`;
      navigate(`/chapter/${r.chapter_slug}${qs}`);
      return;
    }

    if (r.target === "lab") {
      const qs = matchParam ? `?${matchParam}` : "";
      navigate(`/lab/${r.slug}${qs}`);
      return;
    }
  };

  const userInitial = user ? user.username.charAt(0).toUpperCase() : null;

  return (
    <header className="site-header">
      <div className="header-inner">
        {/* Logo — always visible */}
        <div className="logo">
          <Link to="/" className="logo-link">
            <span className="logo-text"><span>Synthetic</span> Data Handbook</span>
            <span className="logo-fill" aria-hidden="true">Synthetic Data Handbook</span>
          </Link>
        </div>

        <div className="header-right">
        {/* Theme toggle */}
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          {theme === "dark" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Desktop nav — hidden on mobile */}
        <nav className="nav nav--desktop">
          <Link className={location.pathname === "/" ? "nav-active" : ""} to="/">
            Главная
          </Link>
          {user && (
            <Link className={location.pathname.startsWith("/user") ? "nav-active" : ""} to="/user">
              {user.username}
            </Link>
          )}
          {user && (user.role === "admin" || user.role === "teacher") && (
            <Link className={location.pathname.startsWith("/admin") ? "nav-active" : ""} to="/admin">
              Админ
            </Link>
          )}
        </nav>

        {/* Search — always visible, shrinks on mobile */}
        <div className="header-search">
          <input
            ref={inputRef}
            value={q}
            placeholder="Поиск…"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setOpen(true);
              runSearch(e.target.value);
            }}
          />

          {open && (
            <div className="search-popover" ref={popRef}>
              {!q.trim() ? (
                <div className="search-empty">
                  Поиск по темам, главам и урокам.
                  <div className="search-hint">Например: "приватность", "GAN", "дифференциальная".</div>
                </div>
              ) : loading ? (
                <div className="search-empty">Ищем…</div>
              ) : results.length === 0 ? (
                <div className="search-empty">Ничего не найдено.</div>
              ) : (
                <>
                  <div className="search-hint">Кликни по результату, чтобы перейти.</div>
                  {results.map((r) => (
                    <button
                      key={`${r.target}-${r.id}`}
                      className="search-item"
                      onClick={() => goTo(r)}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: "var(--foregroundAlt)", marginTop: 2 }}>
                        {r.target === "theme" ? "Тема" : r.target === "chapter" ? "Глава" : r.target === "lab" ? "Лаб" : "Урок"}
                      </div>
                      {r.snippet ? (
                        <div
                          style={{ fontSize: 12, color: "var(--foregroundAlt)", marginTop: 6, lineHeight: 1.35 }}
                          dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
                        />
                      ) : null}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Desktop auth buttons — hidden on mobile */}
        <div className="header-auth header-auth--desktop">
          {user ? (
            <button className="btn-outline" onClick={onLogout}>Выйти</button>
          ) : (
            <button className="btn-outline" onClick={onLoginClick}>Войти</button>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="header-menu-trigger" ref={menuRef}>
          {user ? (
            <button
              className={`header-avatar${menuOpen ? " is-open" : ""}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Меню"
            >
              {userInitial}
            </button>
          ) : (
            <button
              className={`header-burger${menuOpen ? " is-open" : ""}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Меню"
            >
              <span /><span /><span />
            </button>
          )}

          {menuOpen && (
            <div className="header-dropdown">
              <Link className="header-dropdown-item" to="/" onClick={() => setMenuOpen(false)}>
                Главная
              </Link>
              {user && (
                <Link className="header-dropdown-item" to="/user" onClick={() => setMenuOpen(false)}>
                  {user.username}
                </Link>
              )}
              {user && (user.role === "admin" || user.role === "teacher") && (
                <Link className="header-dropdown-item" to="/admin" onClick={() => setMenuOpen(false)}>
                  Админ
                </Link>
              )}
              <div className="header-dropdown-divider" />
              {user ? (
                <button className="header-dropdown-item" onClick={() => { setMenuOpen(false); onLogout(); }}>
                  Выйти
                </button>
              ) : (
                <button className="header-dropdown-item" onClick={() => { setMenuOpen(false); onLoginClick(); }}>
                  Войти
                </button>
              )}
            </div>
          )}
        </div>
        </div>{/* /header-right */}
      </div>
    </header>
  );
}
