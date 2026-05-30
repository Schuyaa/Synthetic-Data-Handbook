/**
 * CourseEditor — правая панель админки в режиме просмотра курса.
 *
 * Показывает:
 *  - Заголовок курса + статистику (групп / пользователей)
 *  - Поле поиска (по группам и пользователям)
 *  - Дерево групп → пользователей с кнопкой-стрелкой «перейти к группе/юзеру»
 */

import { useState, useMemo } from "react";
import { IconArrowRight, TreeChevron } from "./Icons";
import { roleColor } from "./helpers";

function userMatches(user, q) {
  if (!q) return true;
  const hay = [user.username, user.email, user.first_name, user.last_name]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function groupMatches(group, q) {
  if (!q) return true;
  return group.name.toLowerCase().includes(q);
}

export default function CourseEditor({
  courseKey,
  label,
  groupsByCourse,
  users,
  onSelectGroup,
  onSelectUser,
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  /** Локальное collapse-state для списков юзеров под группами в CourseEditor.
   *  Не путать с collapsedGroups в сайдбаре — это независимое состояние,
   *  свернуть юзеров здесь — на сайдбаре никак не отразится. */
  const [collapsedInCourse, setCollapsedInCourse] = useState(new Set());

  const toggleGroupCollapse = (groupId) => {
    setCollapsedInCourse((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const groupsInCourse = useMemo(
    () => groupsByCourse[courseKey] || [],
    [groupsByCourse, courseKey],
  );
  const totalUsers = useMemo(
    () => groupsInCourse.reduce(
      (sum, g) => sum + users.filter((u) => u.group_id === g.id).length,
      0,
    ),
    [groupsInCourse, users],
  );

  /**
   * Группа попадает в результаты если:
   *  - её имя матчит запрос, ИЛИ
   *  - в ней есть юзер, который матчит запрос
   * При совпадении по юзеру — группа автоматически "развёрнута" (в результатах виден юзер).
   */
  const filteredGroups = useMemo(() => {
    return groupsInCourse.map((g) => {
      const groupUsers = users.filter((u) => u.group_id === g.id);
      const groupNameMatches = groupMatches(g, q);
      const matchedUsers = q
        ? groupUsers.filter((u) => userMatches(u, q))
        : groupUsers;
      // Включаем группу если матчит сама она ИЛИ есть совпадения по юзерам
      if (!q || groupNameMatches || matchedUsers.length > 0) {
        return {
          ...g,
          // Если совпало имя группы — показываем всех юзеров; иначе — только матчей
          visibleUsers: q && !groupNameMatches ? matchedUsers : groupUsers,
        };
      }
      return null;
    }).filter(Boolean);
  }, [groupsInCourse, users, q]);

  return (
    <>
      <div className="ap-editor-header">
        <h2>{label}</h2>
        <span className="admin-tree-count" style={{ marginLeft: 4 }}>Групп {groupsInCourse.length}</span>
        <span className="admin-tree-count" style={{ marginLeft: 4 }}>Польз {totalUsers}</span>
      </div>

      <div className="ap-editor-body">
        {/* Поиск */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по группе или пользователю…"
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
              Найдено: {filteredGroups.length}{" "}
              {filteredGroups.length === 1 ? "группа" : "групп"},{" "}
              {filteredGroups.reduce((s, g) => s + g.visibleUsers.length, 0)} польз.
            </div>
          )}
        </div>

        {/* Список групп → юзеров */}
        {groupsInCourse.length === 0 ? (
          <div style={{ color: "var(--foregroundAlt)", fontSize: 13, padding: 24, textAlign: "center" }}>
            В этом курсе пока нет групп
          </div>
        ) : filteredGroups.length === 0 ? (
          <div style={{ color: "var(--foregroundAlt)", fontSize: 13, padding: 24, textAlign: "center" }}>
            Ничего не найдено
          </div>
        ) : (
          <div className="ap-course-groups-list">
            {filteredGroups.map((g) => {
              // При активном поиске группа всегда раскрыта (видим матчи).
              // Без поиска — учитываем локальный collapse.
              const collapsed = !q && collapsedInCourse.has(g.id);
              const hasUsers = g.visibleUsers.length > 0;

              return (
                <div key={g.id} className="ap-course-group-block">
                  {/* Заголовок группы — кликабелен (toggle) */}
                  <div
                    className="ap-course-group-header"
                    onClick={() => hasUsers && toggleGroupCollapse(g.id)}
                    style={{ cursor: hasUsers ? "pointer" : "default" }}
                  >
                    {hasUsers ? (
                      <button
                        type="button"
                        className="admin-tree-toggle"
                        title={collapsed ? "Развернуть" : "Свернуть"}
                        onClick={(e) => { e.stopPropagation(); toggleGroupCollapse(g.id); }}
                      >
                        <TreeChevron collapsed={collapsed}/>
                      </button>
                    ) : (
                      <span className="admin-tree-toggle-spacer"/>
                    )}
                    <span className="admin-tree-kind-dot" style={{ background: "#2A7D6E" }} aria-hidden="true"/>
                    <span className="ap-course-group-name">{g.name}</span>
                    <span className="admin-tree-count">{g.visibleUsers.length}</span>
                    <button
                      type="button"
                      className="ap-link-btn"
                      title="Открыть группу"
                      onClick={(e) => { e.stopPropagation(); onSelectGroup(g.id); }}
                    >
                      <IconArrowRight/>
                    </button>
                  </div>

                  {/* Список юзеров группы — скрывается если collapsed */}
                  {!collapsed && (
                    g.visibleUsers.length === 0 ? (
                      <div style={{ color: "var(--foregroundAlt)", fontSize: 12, padding: "6px 12px 6px 28px" }}>
                        В группе нет пользователей
                      </div>
                    ) : (
                      <div className="ap-course-user-list">
                        {g.visibleUsers.map((u) => {
                          const fullName = [u.last_name, u.first_name].filter(Boolean).join(" ");
                          return (
                            <div key={u.id} className="ap-course-user-item">
                              <span className="admin-tree-kind-dot" style={{ background: roleColor(u.role) }} aria-hidden="true"/>
                              <span className="ap-course-user-name">
                                {u.username}
                                {fullName && (
                                  <span style={{ color: "var(--foregroundAlt)", marginLeft: 6, fontSize: 12 }}>
                                    {fullName}
                                  </span>
                                )}
                              </span>
                              <span className={`admin-tree-role-chip admin-tree-role-chip--${u.role}`}>{u.role}</span>
                              <button
                                type="button"
                                className="ap-link-btn"
                                title="Открыть профиль"
                                onClick={() => onSelectUser(u.id)}
                              >
                                <IconArrowRight/>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
