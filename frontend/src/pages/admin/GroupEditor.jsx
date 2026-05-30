/**
 * Редактор группы — три вкладки:
 *  - Настройки: имя, курс, сохранение
 *  - Пользователи: поиск + список юзеров группы с приватным прогрессом + arrow-кнопка
 *  - Прогресс: средний % группы (aggregate)
 */
import { useState, useMemo } from "react";
import { IconArrowRight } from "./Icons";

function userMatchesQuery(u, q) {
  if (!q) return true;
  const hay = [u.username, u.full_name].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

export default function GroupEditor({
  selectedGroup,
  userRole,
  form, setForm, dirty, setDirty,
  tab, setTab,
  progress, progressLoading,
  users,
  onSave,
  onSelectUser,
  onDelete,
}) {
  const [userQuery, setUserQuery] = useState("");
  const q = userQuery.trim().toLowerCase();

  // Список юзеров группы — берём из progress (если есть) для частного прогресса,
  // иначе fallback на просто список из users[].
  const groupUsersWithProgress = useMemo(() => {
    if (progress?.users) return progress.users;
    // Fallback: пока progress ещё грузится — показываем хотя бы базовую инфу
    return users
      .filter((u) => u.group_id === selectedGroup.id)
      .map((u) => ({
        user_id: u.id,
        username: u.username,
        full_name: [u.last_name, u.first_name].filter(Boolean).join(" ") || null,
        done: 0,
        total: 0,
        pct: 0,
      }));
  }, [progress, users, selectedGroup.id]);

  const filteredUsers = useMemo(
    () => groupUsersWithProgress.filter((u) => userMatchesQuery(u, q)),
    [groupUsersWithProgress, q],
  );

  return (
    <>
      <div className="ap-editor-header">
        <h2>Группа: {selectedGroup.name}</h2>
        {selectedGroup.course && (
          <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>{selectedGroup.course} курс</span>
        )}
        {dirty && <span style={{ fontSize: 11, color: "var(--foregroundAlt)", fontStyle: "italic" }}>(не сохранено)</span>}
      </div>

      <div className="md-tabs" style={{ padding: "0 24px", flexShrink: 0 }}>
        <button type="button" className={`md-tab${tab === "settings" ? " is-active" : ""}`}
          onClick={() => setTab("settings")}>Настройки</button>
        <button type="button" className={`md-tab${tab === "users" ? " is-active" : ""}`}
          onClick={() => setTab("users")}>Пользователи</button>
        <button type="button" className={`md-tab${tab === "progress" ? " is-active" : ""}`}
          onClick={() => setTab("progress")}>Прогресс</button>
      </div>

      <div className="ap-editor-body">
        {tab === "settings" && (
          <div className="ap-user-form">
            <div className="ap-field">
              <label>Название группы</label>
              <input
                value={form.name}
                onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setDirty(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") onSave(); }}
              />
            </div>
            <div className="ap-field">
              <label>Курс</label>
              <select
                value={form.course}
                onChange={(e) => { setForm((p) => ({ ...p, course: e.target.value })); setDirty(true); }}
              >
                <option value="">Без курса</option>
                <option value="1">1 курс</option>
                <option value="2">2 курс</option>
                <option value="3">3 курс</option>
                <option value="4">4 курс</option>
              </select>
            </div>
            <div className="ap-field ap-field--full">
              <button type="button" className="btn-primary" disabled={!dirty} onClick={onSave}>
                Сохранить изменения
              </button>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div>
            {/* Поиск */}
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Поиск по имени пользователя или ФИО…"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--borderPrimary)",
                  borderRadius: 6,
                  font: "inherit",
                  fontSize: 13,
                }}
              />
              {q && (
                <div style={{ fontSize: 11, color: "var(--foregroundAlt)", marginTop: 4 }}>
                  Найдено: {filteredUsers.length} из {groupUsersWithProgress.length}
                </div>
              )}
            </div>

            {/* Список юзеров */}
            {progressLoading && groupUsersWithProgress.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--foregroundAlt)" }}>Загрузка…</div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--foregroundAlt)" }}>
                {q ? "Ничего не найдено" : "В группе пока нет пользователей"}
              </div>
            ) : (
              <div className="ap-course-user-list" style={{ border: "1px solid var(--borderPrimary)", borderRadius: 8, overflow: "hidden" }}>
                {filteredUsers.map((u) => (
                  <div key={u.user_id} className="ap-course-user-item">
                    <span className="ap-course-user-name">
                      {u.username}
                      {u.full_name && (
                        <span style={{ color: "var(--foregroundAlt)", marginLeft: 6, fontSize: 12 }}>
                          {u.full_name}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--foregroundAlt)" }}>
                      {u.done}/{u.total}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: "right" }}>
                      {u.pct}%
                    </span>
                    <button
                      type="button"
                      className="ap-link-btn"
                      title="Открыть профиль"
                      onClick={() => onSelectUser(u.user_id)}
                    >
                      <IconArrowRight/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "progress" && (
          <div>
            {progressLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--foregroundAlt)" }}>Загрузка прогресса...</div>
            ) : progress ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--foregroundAlt)", marginBottom: 6 }}>
                  <span>Средний прогресс группы</span>
                  <span>{progress.avg_pct}% ({progress.users_count} чел.)</span>
                </div>
                <div className="ap-progress-bar-track">
                  <div className="ap-progress-bar-fill" style={{ width: `${progress.avg_pct}%` }}/>
                </div>

                <div style={{ marginTop: 16, fontSize: 12, color: "var(--foregroundAlt)" }}>
                  Детальный список пользователей с приватным прогрессом — во вкладке «Пользователи».
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: "var(--foregroundAlt)" }}>Нет данных о прогрессе</div>
            )}
          </div>
        )}
      </div>

      {userRole === "admin" && (
        <div className="ap-editor-footer">
          <div/>
          <button type="button" className="btn-outline" style={{ color: "#dc2626", borderColor: "#fca5a5" }}
            onClick={() => onDelete(selectedGroup.id)}>
            Удалить группу
          </button>
        </div>
      )}
    </>
  );
}
