/**
 * AdminPage — тонкий shell. Владеет только cross-cutting (auth, layout,
 * activity bar, message bar). Бизнес-логика — в двух доменных хуках:
 *   useStructureManagement / useUsersManagement.
 * Каждый хук возвращает { sidebar, editor } — shell монтирует по activeView.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import SiteHeader from "../components/SiteHeader";
import AuthModal from "../components/AuthModal";
import { useAuth } from "../contexts/useAuth";
import { AdminPageSkeleton } from "../components/Skeletons";
import { getCachedTree } from "../api/content";
import { loadSessionState, saveSessionState } from "../utils/sessionState";

import { IconFolder, IconUsers } from "./admin/Icons";
import { useStructureManagement } from "./admin/useStructureManagement";
import { useUsersManagement } from "./admin/useUsersManagement";

import "../assets/AdminPage.css";


const SIDE_PANEL_BREAKPOINT = 860;
// Персист активной секции админки (структура/пользователи) — чтобы
// возврат с другой страницы учебника открывал ту же секцию.
const ADMIN_VIEW_KEY = "admin_active_view";

export default function AdminPage() {
  const navigate = useNavigate();
  const { user: authUser, ready: authReady, logout, loginSuccess } = useAuth();

  const [showAuth, setShowAuth] = useState(false);
  const openLogin = () => setShowAuth(true);
  const handleLogoutHeader = () => { logout(); navigate("/"); };

  const headerUser = authUser ? { username: authUser.username, role: authUser.role } : null;
  const userRole = authUser?.role || null;

  // ── Message bar ──
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  // useCallback — стабильная identity для effect-deps в дочерних хуках.
  const setMsg = useCallback((text, type = "success") => {
    setMessage(text);
    setMessageType(type);
  }, []);

  // ── Sidebar layout ──
  // activeView восстанавливается из сессии — возврат в админку открывает
  // ту же секцию, что была активна до ухода.
  const [activeView, setActiveView] = useState(
    () => loadSessionState(ADMIN_VIEW_KEY)?.view ?? "structure",
  ); // "structure" | "users"

  useEffect(() => {
    saveSessionState(ADMIN_VIEW_KEY, { view: activeView });
  }, [activeView]);

  const [sidePanelWidth, setSidePanelWidth] = useState(() => {
    const stored = parseInt(localStorage.getItem("adminSidePanelWidth") || "", 10);
    return Number.isFinite(stored) && stored >= 200 && stored <= 700 ? stored : 300;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);

  const [sidePanelOpen, setSidePanelOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= SIDE_PANEL_BREAKPOINT,
  );

  const isMobileViewport = () =>
    typeof window !== "undefined" && window.innerWidth < SIDE_PANEL_BREAKPOINT;

  const closeSidePanelIfMobile = useCallback(() => {
    if (isMobileViewport()) setSidePanelOpen(false);
  }, []);

  /** Клик по иконке Activity Bar:
   *  - закрытая панель → открыть + сменить view;
   *  - та же кнопка при открытой → закрыть (toggle);
   *  - другая кнопка → сменить view, панель остаётся. */
  const handleActivityClick = (view) => {
    if (sidePanelOpen && activeView === view) setSidePanelOpen(false);
    else { setActiveView(view); setSidePanelOpen(true); }
  };

  // Resize sidebar (mouse drag)
  useEffect(() => {
    const ACTIVITY_BAR_W = 48;
    const onMove = (e) => {
      if (!resizingRef.current) return;
      const next = Math.max(200, Math.min(700, e.clientX - ACTIVITY_BAR_W));
      setSidePanelWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("adminSidePanelWidth", String(sidePanelWidth));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidePanelWidth]);

  const startResize = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // Resize: при пересечении breakpoint — дефолтное состояние
  useEffect(() => {
    let prevMobile = isMobileViewport();
    const onResize = () => {
      const nowMobile = isMobileViewport();
      if (nowMobile === prevMobile) return;
      prevMobile = nowMobile;
      setSidePanelOpen(!nowMobile);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ESC закрывает drawer на мобильном
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && sidePanelOpen && isMobileViewport()) {
        setSidePanelOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidePanelOpen]);

  // Domain hooks. setMsg + closeSidePanelIfMobile — стабильные.
  const structure = useStructureManagement({ setMsg, closeSidePanelIfMobile });
  const users = useUsersManagement({ userRole, setMsg, closeSidePanelIfMobile });

  // Loading state — ждём AuthContext
  if (!authReady || (userRole !== "admin" && userRole !== "teacher")) {
    return (
      <>
        <SiteHeader user={headerUser} onLoginClick={openLogin} onLogout={handleLogoutHeader}/>
        <AdminPageSkeleton tree={getCachedTree()}/>
      </>
    );
  }

  return (
    <>
      <SiteHeader user={headerUser} onLoginClick={openLogin} onLogout={handleLogoutHeader}/>

      <div className="ap-layout">

        {/* ═══ Activity Bar ═══ */}
        <nav className="ap-activity-bar">
          <button
            className={`ap-activity-btn${activeView === "structure" && sidePanelOpen ? " is-active" : ""}`}
            onClick={() => handleActivityClick("structure")}
            title="Структура контента"
          >
            <IconFolder/>
          </button>
          <button
            className={`ap-activity-btn${activeView === "users" && sidePanelOpen ? " is-active" : ""}`}
            onClick={() => handleActivityClick("users")}
            title="Пользователи и группы"
          >
            <IconUsers/>
          </button>
        </nav>

        {/* Mobile drawer overlay */}
        <div
          className={`ap-side-overlay${sidePanelOpen ? " is-visible" : ""}`}
          onClick={() => setSidePanelOpen(false)}
          aria-hidden="true"
        />

        {/* ═══ Side Panel ═══ */}
        <aside
          className={`ap-side-panel${sidePanelOpen ? "" : " is-collapsed"}${isResizing ? " is-resizing" : ""}`}
          style={{ width: sidePanelWidth }}
        >
          {activeView === "structure" ? structure.sidebar : users.sidebar}
        </aside>

        {/* ═══ Resizer ═══ */}
        {sidePanelOpen && (
          <div
            className={`ap-side-resizer${isResizing ? " is-resizing" : ""}`}
            onMouseDown={startResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Изменить ширину панели"
          />
        )}

        {/* ═══ Editor Panel ═══ */}
        <main className="ap-editor-panel">
          {message && (
            <div className={`ap-message ap-message--${messageType}`}>
              {message}
            </div>
          )}
          {activeView === "structure" ? structure.editor : users.editor}
        </main>
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onAuthSuccess={loginSuccess}/>
      )}
    </>
  );
}
