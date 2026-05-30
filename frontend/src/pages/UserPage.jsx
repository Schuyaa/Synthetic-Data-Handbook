import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "../components/SiteHeader";
import AuthModal from "../components/AuthModal";
import { fetchTree, fetchMyProgressFull } from "../api/content";
import { fetchQuestionCounts } from "../api/quiz";
import { useAuth } from "../contexts/useAuth";
import { UserPageSkeleton } from "../components/Skeletons";
import {
  buildProgressTree, computeProgressStats,
  progressItemHref, statusIcon, progressTypeBadge,
} from "../utils/progress";


export default function UserPage() {
  const navigate = useNavigate();
  const { user, ready: authReady, logout, loginSuccess } = useAuth();

  const [tree, setTree] = useState([]);
  const [topicMap, setTopicMap] = useState({});
  const [questionMap, setQuestionMap] = useState({});
  const [chapterQTotals, setChapterQTotals] = useState({});
  const [expandedTab, setExpandedTab] = useState(null);

  const [showAuth, setShowAuth] = useState(false);

  const loading = !authReady || !user;

  const openLogin = () => { setShowAuth(true); };
  const handleLogout = () => { logout(); navigate("/"); };

  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      try {
        const [t, prog, qCounts] = await Promise.all([
          fetchTree(),
          fetchMyProgressFull(),
          fetchQuestionCounts(),
        ]);
        if (!alive) return;
        setTree(Array.isArray(t) ? t : []);

        const tmap = {};
        for (const p of (prog?.topics || [])) {
          tmap[p.topic_id] = { status: p.status, updated_at: p.updated_at };
        }
        setTopicMap(tmap);

        const qmap = {};
        for (const q of (prog?.questions || [])) {
          qmap[q.question_id] = q;
        }
        setQuestionMap(qmap);
        setChapterQTotals(qCounts || {});
      } catch { /* ignore */ }
    })();

    return () => { alive = false; };
  }, [user]);

  const stats = useMemo(
    () => computeProgressStats({ tree, topicMap, questionMap, chapterQTotals }),
    [tree, topicMap, questionMap, chapterQTotals],
  );

  const progressTree = useMemo(
    () => buildProgressTree({ tree, topicMap, questionMap, chapterQTotals }),
    [tree, topicMap, questionMap, chapterQTotals],
  );

  const filteredTree = useMemo(() => {
    if (!expandedTab) return [];
    return progressTree
      .map((theme) => ({
        ...theme,
        chapters: theme.chapters
          .map((ch) => ({
            ...ch,
            items: ch.items.filter((it) => it.status === expandedTab),
          }))
          .filter((ch) => ch.items.length > 0),
      }))
      .filter((th) => th.chapters.length > 0);
  }, [progressTree, expandedTab]);

  if (loading) {
    return (
      <>
        <SiteHeader user={null} onLoginClick={openLogin} onLogout={handleLogout}/>
        <div className="page-with-fixed-header" style={{ minHeight: "100vh" }}>
          <UserPageSkeleton/>
        </div>
      </>
    );
  }

  if (!user) return null;

  return (
    <>
      <SiteHeader
        user={{ username: user.username, role: user.role }}
        onLoginClick={openLogin}
        onLogout={handleLogout}
      />

      <div className="page-with-fixed-header" style={{ minHeight: "100vh" }}>
        <div className="user-page">
          <div className="user-card" style={{ padding: "36px 40px" }}>

            <div className="user-profile">
              <div className="user-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt="avatar" style={{ width: "100%", height: "100%", borderRadius: "50%" }}/>
                ) : (
                  user.username[0].toUpperCase()
                )}
              </div>
              <div className="user-info">
                <h2>{user.username}</h2>
                <p>{user.email}</p>
                <p style={{ color: "var(--foregroundAccent)", fontWeight: 600 }}>
                  {user.role === "admin" ? "Администратор" : user.role === "teacher" ? "Преподаватель" : "Студент"}
                </p>
              </div>
            </div>

            <div className="user-stats-grid">
              <div className="user-stat-block">
                <h3>Личные данные</h3>
                <p><b>Имя:</b> {user.first_name || "—"}</p>
                <p><b>Фамилия:</b> {user.last_name || "—"}</p>
                <p><b>Группа:</b> {user.group || "—"}</p>
              </div>

              <div className="user-stat-block">
                <h3>Навигация</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                  <Link to="/" className="btn-outline">Главная</Link>
                  {(user.role === "admin" || user.role === "teacher") && (
                    <Link to="/admin" className="btn-outline">Админ панель</Link>
                  )}
                </div>
              </div>
            </div>

            <div className="user-stat-block">
              <h3 style={{ marginTop: 0 }}>Прогресс обучения</h3>
              <div className="pg-stats-row">
                <span>Уроки + лабы + вопросы</span>
                <span>{stats.done} / {stats.total} ({stats.pct}%)</span>
              </div>
              <div className="user-progress-bar-track">
                <div className="user-progress-bar-fill" style={{ width: `${stats.pct}%` }}/>
              </div>

              <div className="user-status-cards">
                <StatusCard label="Завершено" count={stats.done} state="done"
                  expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
                <StatusCard label="В процессе" count={stats.inProgress} state="in_progress"
                  expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
                <StatusCard label="Не начато" count={stats.notStarted} state="not_started"
                  expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
              </div>

              {expandedTab && filteredTree.length > 0 && (
                <div className="user-progress-list">
                  {filteredTree.map((theme) => (
                    <ThemeBlock key={theme.id} theme={theme} navigate={navigate}/>
                  ))}
                </div>
              )}
              {expandedTab && filteredTree.length === 0 && (
                <div className="pg-empty">Ничего нет в этой категории.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onAuthSuccess={loginSuccess}/>
      )}
    </>
  );
}


/** Карточка-фильтр статуса. */
function StatusCard({ label, count, state, expandedTab, setExpandedTab }) {
  const isActive = expandedTab === state;
  const cls = state === "done" ? "done" : state === "in_progress" ? "progress" : "not-started";
  return (
    <div
      className={`user-status-card ${cls} ${isActive ? "active" : ""}`}
      onClick={() => count > 0 && setExpandedTab(isActive ? null : state)}
      style={{ cursor: count > 0 ? "pointer" : "default" }}
    >
      <span className="count">{count}</span>
      <span className="label">
        {label}
        {count > 0 && (
          <span style={{
            fontSize: 10, display: "inline-block", transition: "transform 0.2s",
            transform: isActive ? "rotate(180deg)" : "", marginLeft: 4,
          }}>&#9660;</span>
        )}
      </span>
    </div>
  );
}

/** Цвет иконки статуса — единый mapping для всего прогресса. */
const STATUS_COLOR = {
  done: "#22c55e",
  in_progress: "#f59e0b",
  not_started: "#9ca3af",
};

/** Тема + её главы + элементы. Презентационный блок. */
function ThemeBlock({ theme, navigate }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        className="progress-list-item pg-theme-title"
        onClick={() => {
          navigate("/");
          setTimeout(() => {
            document.getElementById(`part-${theme.slug}`)?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        }}
      >
        {theme.title}
      </div>
      {theme.chapters.map((ch) => (
        <div key={ch.id}>
          <div
            className={`progress-list-item progress-list-chapter pg-chapter-title${
              ch.kind === "standalone-labs" ? " is-standalone-labs" : ""
            }`}
            onClick={() => ch.slug && navigate(`/chapter/${ch.slug}`)}
          >
            {ch.title}
          </div>
          {ch.items.map((it) => {
            const href = progressItemHref(it);
            const badge = progressTypeBadge(it.type);
            return (
              <div
                key={`${ch.id}-${it.type}-${it.id}`}
                className={`progress-list-item pg-item${href ? " is-clickable" : ""}`}
                onClick={() => href && navigate(href)}
                style={{ "--pg-item-color": STATUS_COLOR[it.status] }}
              >
                <span className="pg-item-icon">{statusIcon(it.status)}</span>
                <span className="pg-item-title">{it.title}</span>
                <span className="pg-type-badge" style={{ "--pg-badge-color": badge.color }}>
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
