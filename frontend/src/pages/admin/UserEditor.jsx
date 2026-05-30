import { useMemo, useState } from "react";
import {
  progressItemHref, statusIcon, progressTypeBadge,
} from "../../utils/progress";
import { PASSWORD_HINT } from "../../utils/validation";

/**
 * Редактор пользователя — настройки + вкладка прогресса.
 *
 * progressData приходит уже в новом формате:
 *   { stats: { total, done, inProgress, notStarted, pct },
 *     progressTree: [{ id, title, slug, chapters: [{ id, title, slug, kind, items: [...] }] }] }
 *
 * Где items — { type: "lesson" | "lab" | "question" | "questions-stub",
 *               id, title, status, slug?, chapterSlug? }
 *
 * Бывшие пропсы filterByStatus/renderProgressTheme больше не нужны —
 * рендер ведёт себя через утилиту utils/progress.js.
 */
export default function UserEditor({
  selectedUser,
  userRole,
  form, setForm, dirty, setDirty,
  editRoles,
  tab, setTab,
  progressData, progressLoading,
  expandedTab, setExpandedTab,
  groups,
  onSaveFields,
  onRoleChange, onSaveRole,
  onGroupChange,
  onDelete,
}) {
  const [showPwd, setShowPwd] = useState(false);
  return (
    <>
      <div className="ap-editor-header">
        <h2>{selectedUser.username}</h2>
        <span className={`admin-tree-role-chip admin-tree-role-chip--${selectedUser.role}`}>{selectedUser.role}</span>
      </div>

      <div className="md-tabs" style={{ padding: "0 24px", flexShrink: 0 }}>
        <button type="button" className={`md-tab${tab === "settings" ? " is-active" : ""}`}
          onClick={() => setTab("settings")}>Настройки</button>
        <button type="button" className={`md-tab${tab === "progress" ? " is-active" : ""}`}
          onClick={() => setTab("progress")}>Прогресс</button>
      </div>

      <div className="ap-editor-body">
        {tab === "settings" && (
          <div className="ap-user-form">
            <div className="ap-field">
              <label>Имя пользователя</label>
              <input
                value={form.username}
                onChange={(e) => { setForm((p) => ({ ...p, username: e.target.value })); setDirty(true); }}
                placeholder="username"
              />
            </div>
            <div className="ap-field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value })); setDirty(true); }}
              />
            </div>
            <div className="ap-field">
              <label>Фамилия</label>
              <input
                value={form.last_name}
                onChange={(e) => { setForm((p) => ({ ...p, last_name: e.target.value })); setDirty(true); }}
              />
            </div>
            <div className="ap-field">
              <label>Имя</label>
              <input
                value={form.first_name}
                onChange={(e) => { setForm((p) => ({ ...p, first_name: e.target.value })); setDirty(true); }}
              />
            </div>

            {/* Новый пароль — оставить пустым = не менять.
                Показать текущий пароль невозможно (bcrypt-хеш необратим). */}
            <div className="ap-field">
              <label>Новый пароль</label>
              <div className="pwd-wrap">
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.password || ""}
                  onChange={(e) => { setForm((p) => ({ ...p, password: e.target.value })); setDirty(true); }}
                  placeholder={`оставить пустым — не менять (${PASSWORD_HINT})`}
                  autoComplete="new-password"
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
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="ap-field ap-field--full">
              <button type="button" className="btn-primary" disabled={!dirty} onClick={onSaveFields}>
                Сохранить изменения
              </button>
              {dirty && (
                <span style={{ marginLeft: 10, fontSize: 11, color: "var(--foregroundAlt)", fontStyle: "italic" }}>не сохранено</span>
              )}
            </div>

            <div className="ap-field">
              <label>Группа</label>
              <select
                value={selectedUser.group_id || ""}
                onChange={(e) => onGroupChange(selectedUser.id, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Без группы</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}{g.course ? ` (${g.course} курс)` : ""}
                  </option>
                ))}
              </select>
            </div>
            {userRole === "admin" && (
              <div className="ap-field">
                <label>Роль</label>
                <select
                  value={editRoles[selectedUser.id] || selectedUser.role}
                  onChange={(e) => {
                    onRoleChange(selectedUser.id, e.target.value);
                    onSaveRole(selectedUser.id, e.target.value);
                  }}
                >
                  <option value="student">student</option>
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            )}
            {userRole === "admin" && (
              <div className="ap-field ap-field--full" style={{ marginTop: 12 }}>
                <button type="button" className="btn-outline" style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                  onClick={() => onDelete(selectedUser.id)}>
                  Удалить пользователя
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "progress" && (
          <UserProgressTab
            progressData={progressData}
            progressLoading={progressLoading}
            expandedTab={expandedTab}
            setExpandedTab={setExpandedTab}
          />
        )}
      </div>
    </>
  );
}


/** Прогресс-вкладка пользователя.
 *  Презентационный — рендерит progressData = { stats, progressTree }
 *  из buildProgressTree/computeProgressStats (utils/progress.js).
 *  Поддерживает фильтр Завершено / В процессе / Не начато. */
function UserProgressTab({ progressData, progressLoading, expandedTab, setExpandedTab }) {
  const filteredTree = useMemo(() => {
    if (!expandedTab || !progressData) return [];
    return progressData.progressTree
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
  }, [progressData, expandedTab]);

  if (progressLoading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--foregroundAlt)" }}>
        Загрузка прогресса...
      </div>
    );
  }
  if (!progressData) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--foregroundAlt)" }}>
        Нет данных о прогрессе
      </div>
    );
  }

  const { stats, progressTree } = progressData;

  return (
    <div>
      <div className="pg-stats-row">
        <span>Уроки + лабы + вопросы</span>
        <span>{stats.done} / {stats.total} ({stats.pct}%)</span>
      </div>
      <div className="ap-progress-bar-track">
        <div className="ap-progress-bar-fill" style={{ width: `${stats.pct}%` }}/>
      </div>

      <div className="ap-progress-grid">
        <ProgressCard label="Завершено" count={stats.done} state="done"
          expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
        <ProgressCard label="В процессе" count={stats.inProgress} state="in_progress"
          expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
        <ProgressCard label="Не начато" count={stats.notStarted} state="not_started"
          expandedTab={expandedTab} setExpandedTab={setExpandedTab}/>
      </div>

      {expandedTab && filteredTree.length > 0 && (
        <div className="pg-tree">
          {filteredTree.map((theme) => (
            <ThemeBlock key={theme.id} theme={theme}/>
          ))}
        </div>
      )}
      {expandedTab && filteredTree.length === 0 && progressTree.length > 0 && (
        <div className="pg-empty">Ничего нет в этой категории.</div>
      )}
    </div>
  );
}

function ProgressCard({ label, count, state, expandedTab, setExpandedTab }) {
  const isActive = expandedTab === state;
  // Маппинг state → CSS-класс цвета (как раньше у .count--*)
  const colorClass = state === "done" ? "done" : state === "in_progress" ? "progress" : "not-started";
  const activeClass = isActive
    ? (state === "done" ? "is-active-done" : state === "in_progress" ? "is-active-progress" : "is-active-not-started")
    : "";
  return (
    <div
      className={`ap-progress-card${count > 0 ? " is-clickable" : ""}${activeClass ? " " + activeClass : ""}`}
      onClick={() => count > 0 && setExpandedTab(isActive ? null : state)}
    >
      <div className={`count count--${colorClass}`}>{count}</div>
      <div className="label">
        {label}
        {count > 0 && (
          <span style={{
            fontSize: 10, display: "inline-block", transition: "transform 0.2s",
            transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
          }}>&#9660;</span>
        )}
      </div>
    </div>
  );
}

/** Цвет иконки статуса в дереве прогресса (общий с UserPage). */
const STATUS_COLOR = {
  done: "#22c55e",
  in_progress: "#f59e0b",
  not_started: "#9ca3af",
};

function ThemeBlock({ theme }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div className="pg-theme-title">{theme.title}</div>
      {theme.chapters.map((ch) => (
        <div key={ch.id}>
          <div className={`pg-chapter-title${ch.kind === "standalone-labs" ? " is-standalone-labs" : ""}`}>
            {ch.title}
          </div>
          {ch.items.map((it) => {
            const href = progressItemHref(it);
            const badge = progressTypeBadge(it.type);
            return (
              <div
                key={`${ch.id}-${it.type}-${it.id}`}
                className={`pg-item${href ? " is-clickable" : ""}`}
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
