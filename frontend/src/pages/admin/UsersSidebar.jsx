/**
 * UsersSidebar — левая колонка админки в режиме «Пользователи».
 *
 * Содержит:
 *  - Header с кнопкой обновления
 *  - Кнопки создания (+ Группа / + Пользователь)
 *  - Дерево курс → группа → пользователь + раздел «Без группы»
 *
 * Презентационный — состояние и handlers через props.
 */

import { IconRefresh, IconEdit, IconTrash, IconPlus, TreeChevron } from "./Icons";
import { roleColor } from "./helpers";

function UserRow({ u, depth, editMode, selectedUserId, onSelectUser }) {
  const active = editMode === "user" && selectedUserId === u.id;
  const fullName = [u.last_name, u.first_name].filter(Boolean).join(" ");
  const tooltip = [u.username, fullName, u.email, u.role].filter(Boolean).join(" · ");
  return (
    <div
      key={u.id}
      className={`admin-tree-row${active ? " is-active" : ""}`}
      onClick={() => onSelectUser(u.id)}
      style={{ paddingLeft: 6 + depth * 12 }}
      title={tooltip}
    >
      <span className="admin-tree-toggle-spacer"/>
      <span className="admin-tree-kind-dot" style={{ background: roleColor(u.role) }} aria-hidden="true"/>
      <span className="admin-tree-title">
        {u.username}
        {fullName && (
          <span style={{ color: "var(--foregroundAlt)", marginLeft: 6, fontSize: 12 }}>
            {fullName}
          </span>
        )}
      </span>
      <span className={`admin-tree-role-chip admin-tree-role-chip--${u.role}`}>{u.role}</span>
    </div>
  );
}

function GroupSection({
  g, depth, users, collapsedGroups,
  editMode, selectedGroupId, selectedUserId,
  userRole,
  toggleGroupCollapse, selectGroupForEdit, onSelectUser, handleDeleteGroup,
  openUserCreate,
}) {
  const groupUsers = users.filter((u) => u.group_id === g.id);
  const open = !collapsedGroups.has(g.id);
  const isActiveGroup = editMode === "group" && selectedGroupId === g.id;
  const hasChildren = groupUsers.length > 0;
  const tooltip = `Группа · ${g.name}${g.course ? ` · ${g.course} курс` : ""} · ${groupUsers.length} чел`;

  return (
    <div key={g.id} className="admin-tree-node">
      <div
        className={`admin-tree-row admin-tree-row--with-actions${isActiveGroup ? " is-active" : ""}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        title={tooltip}
        onClick={() => selectGroupForEdit(g.id)}
        onDoubleClick={(e) => {
          // Двойной клик по строке группы — свернуть/развернуть.
          // Игнорируем клик по стрелке и кнопкам действий.
          if (e.target.closest(".admin-tree-toggle, .admin-tree-actions")) return;
          if (!hasChildren) return;
          window.getSelection()?.removeAllRanges();
          toggleGroupCollapse(g.id);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="admin-tree-toggle"
            onClick={(e) => { e.stopPropagation(); toggleGroupCollapse(g.id); }}
            aria-label={open ? "Свернуть" : "Развернуть"}
          >
            <TreeChevron collapsed={!open}/>
          </button>
        ) : (
          <span className="admin-tree-toggle-spacer"/>
        )}
        <span className="admin-tree-kind-dot" style={{ background: "#2A7D6E" }} aria-hidden="true"/>
        <span className="admin-tree-title">{g.name}</span>
        <span className="admin-tree-count">{groupUsers.length}</span>
        <div className="admin-tree-actions">
          <button
            className="admin-tree-action-btn"
            title="Добавить пользователя в эту группу"
            onClick={(e) => { e.stopPropagation(); openUserCreate(g.id); }}
          >
            <IconPlus/>
          </button>
          <button
            className="admin-tree-action-btn"
            title="Редактировать"
            onClick={(e) => { e.stopPropagation(); selectGroupForEdit(g.id); }}
          >
            <IconEdit/>
          </button>
          {userRole === "admin" && (
            <button
              className="admin-tree-action-btn admin-tree-action-btn--danger"
              title="Удалить"
              onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
            >
              <IconTrash/>
            </button>
          )}
        </div>
      </div>
      {open && hasChildren && (
        <div className="admin-tree-children">
          {groupUsers.map((u) => (
            <UserRow
              key={u.id} u={u} depth={depth + 1}
              editMode={editMode} selectedUserId={selectedUserId}
              onSelectUser={onSelectUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseSection({
  courseKey, label, groupsByCourse, users,
  collapsedCourses, toggleCourseCollapse,
  selectCourse, selectedCourseKey, editMode,
  openGroupCreate,
  groupSectionProps,
}) {
  const groupsInCourse = groupsByCourse[courseKey] || [];
  if (groupsInCourse.length === 0) return null;
  const open = !collapsedCourses.has(courseKey);
  const isActive = editMode === "course" && selectedCourseKey === courseKey;
  const totalUsers = groupsInCourse.reduce(
    (sum, g) => sum + users.filter((u) => u.group_id === g.id).length,
    0,
  );
  const tooltip = `${label} · ${groupsInCourse.length} гр · ${totalUsers} чел`;

  return (
    <div key={courseKey} className="admin-tree-node">
      <div
        className={`admin-tree-row admin-tree-row--heading admin-tree-row--with-actions${isActive ? " is-active" : ""}`}
        style={{ paddingLeft: 6 }}
        title={tooltip}
        onClick={() => selectCourse(courseKey)}
        onDoubleClick={(e) => {
          // Двойной клик по строке курса — свернуть/развернуть.
          // Игнорируем клик по стрелке и кнопкам действий.
          if (e.target.closest(".admin-tree-toggle, .admin-tree-actions")) return;
          window.getSelection()?.removeAllRanges();
          toggleCourseCollapse(courseKey);
        }}
      >
        <button
          type="button"
          className="admin-tree-toggle"
          onClick={(e) => { e.stopPropagation(); toggleCourseCollapse(courseKey); }}
          aria-label={open ? "Свернуть" : "Развернуть"}
        >
          <TreeChevron collapsed={!open}/>
        </button>
        <span className="admin-tree-kind-dot" style={{ background: "#64748B" }} aria-hidden="true"/>
        <span className="admin-tree-title">{label}</span>
        <span className="admin-tree-count" title="Групп в курсе">Гр {groupsInCourse.length}</span>
        <span className="admin-tree-count" title="Пользователей в курсе">Польз {totalUsers}</span>
        <div className="admin-tree-actions">
          <button
            className="admin-tree-action-btn"
            title="Создать группу в этом курсе"
            onClick={(e) => { e.stopPropagation(); openGroupCreate(courseKey); }}
          >
            <IconPlus/>
          </button>
        </div>
      </div>
      {open && (
        <div className="admin-tree-children">
          {groupsInCourse.map((g) => (
            <GroupSection key={g.id} g={g} depth={1} users={users} {...groupSectionProps}/>
          ))}
        </div>
      )}
    </div>
  );
}

function NoGroupSection({
  noGroupUsers, collapsedGroups, toggleGroupCollapse,
  editMode, selectedUserId, onSelectUser,
}) {
  if (noGroupUsers.length === 0) return null;
  const open = !collapsedGroups.has("__no-group__");
  const tooltip = `Без группы · ${noGroupUsers.length} чел`;

  return (
    <div className="admin-tree-node">
      <div
        className="admin-tree-row admin-tree-row--heading"
        style={{ paddingLeft: 6 }}
        title={tooltip}
        onClick={() => toggleGroupCollapse("__no-group__")}
      >
        <button
          type="button"
          className="admin-tree-toggle"
          onClick={(e) => { e.stopPropagation(); toggleGroupCollapse("__no-group__"); }}
          aria-label={open ? "Свернуть" : "Развернуть"}
        >
          <TreeChevron collapsed={!open}/>
        </button>
        <span className="admin-tree-kind-dot" style={{ background: "#94A3B8" }} aria-hidden="true"/>
        <span className="admin-tree-title">Без группы</span>
        <span className="admin-tree-count">{noGroupUsers.length}</span>
      </div>
      {open && (
        <div className="admin-tree-children">
          {noGroupUsers.map((u) => (
            <UserRow
              key={u.id} u={u} depth={1}
              editMode={editMode} selectedUserId={selectedUserId}
              onSelectUser={onSelectUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function UsersSidebar({
  // Data
  groupsByCourse, adminGroups, users, noGroupUsers,
  // Selection state
  editMode, selectedUserId, selectedGroupId, selectedCourseKey,
  // Role
  userRole,
  // Collapse state
  collapsedCourses, collapsedGroups,
  toggleCourseCollapse, toggleGroupCollapse,
  // Selection / action handlers
  selectUser, selectGroupForEdit, selectCourse, handleDeleteGroup,
  openGroupCreate, openUserCreate,
  // Refresh
  onRefresh,
}) {
  const groupSectionProps = {
    collapsedGroups,
    editMode, selectedGroupId, selectedUserId,
    userRole,
    toggleGroupCollapse, selectGroupForEdit, onSelectUser: selectUser, handleDeleteGroup,
    openUserCreate,
  };

  return (
    <>
      <div className="ap-side-header">
        <span className="ap-side-title">Пользователи</span>
        <div className="ap-side-actions">
          <button className="ap-icon-btn" title="Обновить" onClick={onRefresh}>
            <IconRefresh/>
          </button>
        </div>
      </div>

      <div className="ap-create-buttons">
        <button
          className={`btn-outline${editMode === "group-create" ? " is-active" : ""}`}
          type="button"
          onClick={openGroupCreate}
          style={{ flex: 1 }}
        >
          + Группа
        </button>
        <button
          className={`btn-outline${editMode === "user-create" ? " is-active" : ""}`}
          type="button"
          onClick={openUserCreate}
          style={{ flex: 1 }}
        >
          + Пользователь
        </button>
      </div>

      <div className="ap-side-scroll">
        <CourseSection
          courseKey={1} label="1 курс"
          groupsByCourse={groupsByCourse} users={users}
          collapsedCourses={collapsedCourses} toggleCourseCollapse={toggleCourseCollapse}
          selectCourse={selectCourse} selectedCourseKey={selectedCourseKey} editMode={editMode}
          openGroupCreate={openGroupCreate}
          groupSectionProps={groupSectionProps}
        />
        <CourseSection
          courseKey={2} label="2 курс"
          groupsByCourse={groupsByCourse} users={users}
          collapsedCourses={collapsedCourses} toggleCourseCollapse={toggleCourseCollapse}
          selectCourse={selectCourse} selectedCourseKey={selectedCourseKey} editMode={editMode}
          openGroupCreate={openGroupCreate}
          groupSectionProps={groupSectionProps}
        />
        <CourseSection
          courseKey={3} label="3 курс"
          groupsByCourse={groupsByCourse} users={users}
          collapsedCourses={collapsedCourses} toggleCourseCollapse={toggleCourseCollapse}
          selectCourse={selectCourse} selectedCourseKey={selectedCourseKey} editMode={editMode}
          openGroupCreate={openGroupCreate}
          groupSectionProps={groupSectionProps}
        />
        <CourseSection
          courseKey={4} label="4 курс"
          groupsByCourse={groupsByCourse} users={users}
          collapsedCourses={collapsedCourses} toggleCourseCollapse={toggleCourseCollapse}
          selectCourse={selectCourse} selectedCourseKey={selectedCourseKey} editMode={editMode}
          openGroupCreate={openGroupCreate}
          groupSectionProps={groupSectionProps}
        />
        <CourseSection
          courseKey="none" label="Без курса"
          groupsByCourse={groupsByCourse} users={users}
          collapsedCourses={collapsedCourses} toggleCourseCollapse={toggleCourseCollapse}
          selectCourse={selectCourse} selectedCourseKey={selectedCourseKey} editMode={editMode}
          openGroupCreate={openGroupCreate}
          groupSectionProps={groupSectionProps}
        />
        <NoGroupSection
          noGroupUsers={noGroupUsers}
          collapsedGroups={collapsedGroups} toggleGroupCollapse={toggleGroupCollapse}
          editMode={editMode} selectedUserId={selectedUserId}
          onSelectUser={selectUser}
        />

        {adminGroups.length === 0 && noGroupUsers.length === 0 && (
          <div style={{ color: "var(--foregroundAlt)", fontSize: 13, padding: 12, textAlign: "center" }}>
            Создайте группу или пользователя, чтобы начать
          </div>
        )}
      </div>
    </>
  );
}
