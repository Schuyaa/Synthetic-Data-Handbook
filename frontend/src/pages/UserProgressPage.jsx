import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "../components/SiteHeader";
import AuthModal from "../components/AuthModal";
import { fetchTree, fetchUserProgressFull } from "../api/content";
import { fetchQuestionCounts } from "../api/quiz";
import { useAuth } from "../contexts/useAuth";
import { fetchAllUsers } from "../api/admin";
import { UserProgressSkeleton } from "../components/Skeletons";
import {
  buildProgressTree, computeProgressStats,
  progressItemHref, statusIcon, progressTypeBadge,
} from "../utils/progress";


export default function UserProgressPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: authUser, ready: authReady, logout, loginSuccess } = useAuth();
  const headerUser = useMemo(
    () => (authUser ? { username: authUser.username, role: authUser.role } : null),
    [authUser],
  );

  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [targetUser, setTargetUser] = useState(null);
  const [tree, setTree] = useState([]);
  const [topicMap, setTopicMap] = useState({});
  const [questionMap, setQuestionMap] = useState({});
  const [chapterQTotals, setChapterQTotals] = useState({});
  const [expandedTab, setExpandedTab] = useState(null);

  const openLogin = () => setShowAuth(true);
  const handleLogout = () => { logout(); navigate("/"); };

  useEffect(() => {
    if (!authReady || !headerUser) return;
    let alive = true;

    (async () => {
      try {
        const loadUser = fetchAllUsers().then((users) =>
          (users || []).find((u) => u.id === Number(id)) || null,
        );
        const [u, prog, t, qCounts] = await Promise.all([
          loadUser,
          fetchUserProgressFull(id),
          fetchTree(),
          fetchQuestionCounts(),
        ]);
        if (!alive) return;

        setTargetUser(u);
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
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [authReady, headerUser, id]);

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
        <SiteHeader user={headerUser} onLoginClick={openLogin} onLogout={handleLogout}/>
        <div className="page-with-fixed-header" style={{ width: "100vw", minHeight: "100vh" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 48 }}>
            <UserProgressSkeleton/>
          </div>
        </div>
      </>
    );
  }

  if (!targetUser) {
    return (
      <>
        <SiteHeader user={headerUser} onLoginClick={openLogin} onLogout={handleLogout}/>
        <div className="page-with-fixed-header" style={{ textAlign: "center", marginTop: 80 }}>
          Пользователь не найден.
          <div style={{ marginTop: 14 }}><Link to="/admin" className="btn-outline">Назад</Link></div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader user={headerUser} onLoginClick={openLogin} onLogout={handleLogout}/>

      <div className="page-with-fixed-header" style={{ width: "100vw", minHeight: "100vh" }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 48 }}>
          <div style={{
            width: "70vw", maxWidth: 900,
            background: "var(--backgroundBase)", borderRadius: "var(--radius-16)",
            boxShadow: "var(--shadow-popover)", padding: "40px 48px",
            display: "flex", flexDirection: "column", gap: 28,
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div className="pg-user-avatar-circle">{targetUser.username[0]}</div>
                <div>
                  <div className="pg-user-meta-name">{targetUser.username}</div>
                  <div className="pg-user-meta-sub">
                    {targetUser.email}
                    {targetUser.group && ` · ${targetUser.group}`}
                    {` · `}
                    {targetUser.role === "admin" ? "Администратор" : targetUser.role === "teacher" ? "Преподаватель" : "Студент"}
                  </div>
                </div>
              </div>
              <Link to="/admin" className="btn-outline">Назад в админ панель</Link>
            </div>

            <div style={{ borderRadius: "var(--radius-12)", padding: 18, border: "1px solid var(--borderPrimary)" }}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Прогресс обучения</h3>
              <div className="pg-stats-row">
                <span>Уроки + лабы + вопросы</span>
                <span>{stats.done} / {stats.total} ({stats.pct}%)</span>
              </div>
              <div style={{ height: 8, background: "var(--grey-11)", borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
                <div style={{
                  height: "100%", width: `${stats.pct}%`,
                  background: "var(--foregroundAccent)", borderRadius: 4, transition: "width 0.3s",
                }}/>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <StatusTile label="Завершено" count={stats.done} state="done"
                  expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
                <StatusTile label="В процессе" count={stats.inProgress} state="in_progress"
                  expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
                <StatusTile label="Не начато" count={stats.notStarted} state="not_started"
                  expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
              </div>

              {expandedTab && filteredTree.length > 0 && (
                <div className="pg-tree pg-tree--tall">
                  {filteredTree.map((theme) => (
                    <ThemeBlock key={theme.id} theme={theme}/>
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


// Цвета статусов и tile'ов — единый mapping (используется только тут).
const TILE_COLOR = {
  done: "#22c55e",
  in_progress: "#f59e0b",
  not_started: "var(--grey-30)",
};
const STATUS_COLOR = {
  done: "#22c55e",
  in_progress: "#f59e0b",
  not_started: "#9ca3af",
};

function StatusTile({ label, count, state, expandedTab, setExpandedTab }) {
  const isActive = expandedTab === state;
  return (
    <div
      className={`pg-tile${count > 0 ? " is-clickable" : ""}${isActive ? " is-active" : ""}`}
      onClick={() => count > 0 && setExpandedTab(isActive ? null : state)}
      style={{ "--pg-tile-color": TILE_COLOR[state] }}
    >
      <div className="pg-tile-count">{count}</div>
      <div className="pg-tile-label">
        {label}
        {count > 0 && (
          <span className={`pg-tile-chevron${isActive ? " is-flipped" : ""}`}>&#9660;</span>
        )}
      </div>
    </div>
  );
}

function ThemeBlock({ theme }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div className="progress-list-item pg-theme-title" style={{ cursor: "default" }}>
        {theme.title}
      </div>
      {theme.chapters.map((ch) => (
        <div key={ch.id}>
          <div
            className={`progress-list-item pg-chapter-title${
              ch.kind === "standalone-labs" ? " is-standalone-labs" : ""
            }`}
            style={{ cursor: "default", borderRadius: 0 }}
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
                onClick={() => { if (href) window.open(href, "_blank", "noopener"); }}
                title={href ? "Открыть в новой вкладке" : undefined}
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
