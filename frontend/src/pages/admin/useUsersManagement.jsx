/**
 * useUsersManagement — хук-владелец users-домена (users + groups + courses).
 *
 * Возвращает: { sidebar, editor, refresh }.
 * Принимает: { userRole, setMsg, closeSidePanelIfMobile } из shell.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchTree, fetchUserProgressFull,
} from "../../api/content";
import { fetchQuestionCounts } from "../../api/quiz";
import {
  fetchGroups, createGroup, updateGroup, deleteGroup, fetchGroupProgress,
} from "../../api/groups";
import {
  createUser, updateUserFields,
  fetchAllUsers, updateUserRole, updateUserGroup, deleteUser as apiDeleteUser,
} from "../../api/admin";
import { buildProgressTree, computeProgressStats } from "../../utils/progress";
import { validatePassword } from "../../utils/validation";
import { loadSessionState, saveSessionState } from "../../utils/sessionState";

import GroupCreate from "./GroupCreate";
import UserCreate from "./UserCreate";
import UserEditor from "./UserEditor";
import GroupEditor from "./GroupEditor";
import CourseEditor from "./CourseEditor";
import UsersSidebar from "./UsersSidebar";


const EMPTY_USER_CREATE = {
  username: "", email: "", password: "",
  first_name: "", last_name: "",
  role: "student", group_id: "",
};
const EMPTY_GROUP_CREATE = { name: "", course: "" };

// Ключ персиста навигационного состояния секции «Пользователи».
// См. utils/sessionState.js — переживает SPA-навигацию и F5.
const USERS_STATE_KEY = "admin_users_state";


export function useUsersManagement({ userRole, setMsg, closeSidePanelIfMobile }) {
  // Восстановленное из sessionStorage состояние (один раз на маунте).
  const [persisted] = useState(() => loadSessionState(USERS_STATE_KEY));

  // ── Data ──
  const [users, setUsers] = useState([]);
  const [adminGroups, setAdminGroups] = useState([]);
  const [editRoles, setEditRoles] = useState({});

  // ── Selection / mode ── (восстанавливаются из сессии)
  const [selectedUserId, setSelectedUserId] = useState(persisted?.selectedUserId ?? null);
  const [selectedGroupId, setSelectedGroupId] = useState(persisted?.selectedGroupId ?? null);
  const [selectedCourseKey, setSelectedCourseKey] = useState(persisted?.selectedCourseKey ?? null);
  // null | "user" | "user-create" | "group" | "group-create" | "course"
  const [editMode, setEditMode] = useState(persisted?.editMode ?? null);

  // ── Tree state ── (свёрнутые курсы/группы восстанавливаются из сессии)
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(persisted?.collapsedGroups ?? []),
  );
  const [collapsedCourses, setCollapsedCourses] = useState(
    () => new Set(persisted?.collapsedCourses ?? []),
  );

  // ── User editor ──
  const [userForm, setUserForm] = useState({
    username: "", email: "", first_name: "", last_name: "", password: "",
  });
  const [userFormDirty, setUserFormDirty] = useState(false);
  const [userEditorTab, setUserEditorTab] = useState("settings");
  const [userProgress, setUserProgress] = useState(null);
  const [userProgressLoading, setUserProgressLoading] = useState(false);
  const [progressExpandedTab, setProgressExpandedTab] = useState(null);

  // ── User create ──
  const [userCreateForm, setUserCreateForm] = useState(EMPTY_USER_CREATE);

  // ── Group editor ──
  const [groupForm, setGroupForm] = useState({ name: "", course: "" });
  const [groupDirty, setGroupDirty] = useState(false);
  const [groupEditorTab, setGroupEditorTab] = useState("settings");
  const [groupProgress, setGroupProgress] = useState(null);
  const [groupProgressLoading, setGroupProgressLoading] = useState(false);

  // ── Group create ──
  const [groupCreateForm, setGroupCreateForm] = useState(EMPTY_GROUP_CREATE);

  // ── Derived data ──
  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId],
  );
  const selectedGroup = useMemo(
    () => adminGroups.find((g) => g.id === selectedGroupId) || null,
    [adminGroups, selectedGroupId],
  );

  const groupsByCourse = useMemo(() => {
    const buckets = { 1: [], 2: [], 3: [], 4: [], none: [] };
    for (const g of adminGroups) {
      const key = g.course && [1, 2, 3, 4].includes(g.course) ? g.course : "none";
      buckets[key].push(g);
    }
    return buckets;
  }, [adminGroups]);

  const noGroupUsers = useMemo(() => users.filter((u) => !u.group_id), [users]);

  // ── Fetchers ──
  const fetchUsers = useCallback(async () => {
    const data = await fetchAllUsers();
    setUsers(Array.isArray(data) ? data : []);
  }, []);

  const loadGroups = useCallback(async () => {
    const gs = await fetchGroups();
    setAdminGroups(gs || []);
  }, []);

  const refresh = useCallback(() => {
    fetchUsers();
    loadGroups();
  }, [fetchUsers, loadGroups]);

  // Initial load
  const [didInit, setDidInit] = useState(false);
  useEffect(() => {
    if (didInit) return;
    setDidInit(true);
    fetchUsers();
    loadGroups();
  }, [didInit, fetchUsers, loadGroups]);

  // Свернуть users-дерево при первой загрузке.
  const [usersTreeInited, setUsersTreeInited] = useState(false);
  useEffect(() => {
    if (usersTreeInited) return;
    if (adminGroups.length === 0 && users.length === 0) return;
    // Если состояние дерева восстановлено из сессии — НЕ пересворачиваем
    // (иначе перезатёрли бы сохранённое раскрытие курсов/групп).
    if (!persisted) {
      const courseKeys = new Set();
      for (const g of adminGroups) {
        const ck = g.course && [1, 2, 3, 4].includes(g.course) ? g.course : "none";
        courseKeys.add(ck);
      }
      if (users.some((u) => !u.group_id)) courseKeys.add("__no-group__");
      setCollapsedCourses(new Set([...courseKeys].filter((k) => k !== "__no-group__")));
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        adminGroups.forEach((g) => next.add(g.id));
        if (courseKeys.has("__no-group__")) next.add("__no-group__");
        return next;
      });
    }
    setUsersTreeInited(true);
  }, [adminGroups, users, usersTreeInited, persisted]);

  // Персист навигационного состояния в sessionStorage. Create-режимы
  // (user-create/group-create) не сохраняем — форма создания пустая,
  // восстанавливать незаконченное создание смысла нет.
  useEffect(() => {
    const persistMode =
      editMode === "user-create" || editMode === "group-create" ? null : editMode;
    saveSessionState(USERS_STATE_KEY, {
      selectedUserId,
      selectedGroupId,
      selectedCourseKey,
      editMode: persistMode,
      collapsedGroups: Array.from(collapsedGroups),
      collapsedCourses: Array.from(collapsedCourses),
    });
  }, [selectedUserId, selectedGroupId, selectedCourseKey, editMode, collapsedGroups, collapsedCourses]);

  // Восстановление формы редактора при выборе пользователя/группы.
  // selectUser/selectGroupForEdit заполняют форму сами при клике, но
  // при восстановлении из сессии хендлеры не вызываются — поэтому
  // синхронизируем форму с derived-данными через эффект.
  //
  // Гард `if (dirty) return`: selectedUser/selectedGroup — это объекты из
  // useMemo(users.find(...)). При fetchUsers/loadGroups (после смены роли,
  // группы и т.п.) массив пересоздаётся → пересоздаётся и объект, хотя
  // данные те же. Без гарда эффект перезатёр бы несохранённые правки
  // формы. dirty=false при первом заполнении и при восстановлении из
  // сессии, поэтому форма всё равно заполняется.
  useEffect(() => {
    if (editMode !== "user" || !selectedUser) return;
    if (userFormDirty) return;
    setUserForm({
      username: selectedUser.username || "",
      email: selectedUser.email || "",
      first_name: selectedUser.first_name || "",
      last_name: selectedUser.last_name || "",
      password: "",
    });
  }, [selectedUser, editMode, userFormDirty]);

  useEffect(() => {
    if (editMode !== "group" || !selectedGroup) return;
    if (groupDirty) return;
    setGroupForm({
      name: selectedGroup.name || "",
      course: selectedGroup.course != null ? String(selectedGroup.course) : "",
    });
  }, [selectedGroup, editMode, groupDirty]);

  // ── Selection cleanup ──
  const clearSelections = () => {
    setSelectedUserId(null);
    setSelectedGroupId(null);
    setSelectedCourseKey(null);
  };

  // ── Tree expand helpers ──
  const expandCourseForGroup = (groupId) => {
    const g = adminGroups.find((x) => x.id === groupId);
    if (!g) return;
    const courseKey = g.course && [1, 2, 3, 4].includes(g.course) ? g.course : "none";
    setCollapsedCourses((prev) => {
      if (!prev.has(courseKey)) return prev;
      const next = new Set(prev);
      next.delete(courseKey);
      return next;
    });
  };

  const expandGroupAndCourseForUser = (userId) => {
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    if (!u.group_id) {
      setCollapsedGroups((prev) => {
        if (!prev.has("__no-group__")) return prev;
        const next = new Set(prev);
        next.delete("__no-group__");
        return next;
      });
      return;
    }
    setCollapsedGroups((prev) => {
      if (!prev.has(u.group_id)) return prev;
      const next = new Set(prev);
      next.delete(u.group_id);
      return next;
    });
    expandCourseForGroup(u.group_id);
  };

  // ── Selection handlers ──
  const selectUser = (userId) => {
    clearSelections();
    setSelectedUserId(userId);
    setEditMode("user");
    setUserEditorTab("settings");
    setProgressExpandedTab(null);
    const u = users.find((x) => x.id === userId);
    if (u) {
      setUserForm({
        username: u.username || "",
        email: u.email || "",
        first_name: u.first_name || "",
        last_name: u.last_name || "",
        password: "",
      });
      setUserFormDirty(false);
    }
    expandGroupAndCourseForUser(userId);
    setMsg("");
    closeSidePanelIfMobile?.();
  };

  const selectGroupForEdit = (groupId) => {
    clearSelections();
    setSelectedGroupId(groupId);
    setEditMode("group");
    const g = adminGroups.find((x) => x.id === groupId);
    if (g) {
      setGroupForm({ name: g.name || "", course: g.course != null ? String(g.course) : "" });
      setGroupDirty(false);
    }
    setGroupEditorTab("settings");
    expandCourseForGroup(groupId);
    setMsg("");
    closeSidePanelIfMobile?.();
  };

  const selectCourse = (courseKey) => {
    clearSelections();
    setSelectedCourseKey(courseKey);
    setEditMode("course");
    setMsg("");
    closeSidePanelIfMobile?.();
  };

  const openUserCreate = (initialGroupId = "") => {
    clearSelections();
    setEditMode("user-create");
    setUserCreateForm({ ...EMPTY_USER_CREATE, group_id: initialGroupId ? String(initialGroupId) : "" });
    setMsg("");
  };

  const openGroupCreate = (initialCourse = "") => {
    const course = initialCourse && initialCourse !== "none" ? String(initialCourse) : "";
    clearSelections();
    setEditMode("group-create");
    setGroupCreateForm({ ...EMPTY_GROUP_CREATE, course });
    setMsg("");
  };

  // empty-state после save/delete/cancel
  const closeEditor = () => {
    clearSelections();
    setEditMode(null);
    setMsg("");
  };

  // ── Load user progress when user is selected ──
  useEffect(() => {
    if (editMode !== "user" || !selectedUserId) return;
    let alive = true;
    setUserProgressLoading(true);
    setUserProgress(null);
    setProgressExpandedTab(null);

    (async () => {
      try {
        const [prog, contentTree, qCounts] = await Promise.all([
          fetchUserProgressFull(selectedUserId),
          fetchTree(),
          fetchQuestionCounts(),
        ]);
        if (!alive) return;

        const tmap = {};
        for (const p of (prog?.topics || [])) {
          tmap[p.topic_id] = { status: p.status, updated_at: p.updated_at };
        }
        const qmap = {};
        for (const q of (prog?.questions || [])) qmap[q.question_id] = q;

        const stats = computeProgressStats({
          tree: contentTree, topicMap: tmap, questionMap: qmap, chapterQTotals: qCounts || {},
        });
        const progressTree = buildProgressTree({
          tree: contentTree, topicMap: tmap, questionMap: qmap, chapterQTotals: qCounts || {},
        });

        setUserProgress({ stats, progressTree });
      } catch { /* ignore */ } finally {
        if (alive) setUserProgressLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [editMode, selectedUserId]);

  // ── Load group progress when group is selected ──
  useEffect(() => {
    if (editMode !== "group" || !selectedGroupId) return;
    let alive = true;
    setGroupProgressLoading(true);
    setGroupProgress(null);
    fetchGroupProgress(selectedGroupId).then((data) => {
      if (!alive) return;
      setGroupProgress(data);
      setGroupProgressLoading(false);
    });
    return () => { alive = false; };
  }, [editMode, selectedGroupId]);

  // ── Handlers ──
  const handleRoleChange = (userId, newRole) => setEditRoles((p) => ({ ...p, [userId]: newRole }));

  const handleSaveRole = async (userId, roleOverride) => {
    const role = roleOverride || editRoles[userId];
    if (!role) return;
    const result = await updateUserRole(userId, role);
    if (result === true) {
      fetchUsers();
      setMsg("Роль обновлена");
    } else {
      setMsg(result?.error || "Ошибка обновления роли", "error");
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Удалить пользователя?")) return;
    await apiDeleteUser(id);
    fetchUsers();
    if (selectedUserId === id) closeEditor();
    setMsg("Пользователь удалён");
  };

  const handleCreateGroupFromForm = async () => {
    const name = groupCreateForm.name.trim();
    if (!name) { setMsg("Название группы не может быть пустым", "error"); return; }
    const course = groupCreateForm.course === "" ? null : Number(groupCreateForm.course);
    const result = await createGroup(name, course);
    if (result?.error) { setMsg(result.error, "error"); return; }
    if (result) {
      setMsg("Группа создана");
      await loadGroups();
      selectGroupForEdit(result.id);
    }
  };

  const handleSaveGroup = async () => {
    if (!selectedGroupId) return;
    const name = groupForm.name.trim();
    if (!name) { setMsg("Название группы не может быть пустым", "error"); return; }
    const patch = { name, course: groupForm.course === "" ? null : Number(groupForm.course) };
    const result = await updateGroup(selectedGroupId, patch);
    if (result?.error) { setMsg(result.error, "error"); return; }
    if (result) {
      setGroupDirty(false);
      loadGroups();
      setMsg("Группа сохранена");
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("Удалить группу? Пользователи перейдут в «Без группы».")) return;
    await deleteGroup(groupId);
    loadGroups();
    fetchUsers();
    if (selectedGroupId === groupId) closeEditor();
    setMsg("Группа удалена");
  };

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const toggleCourseCollapse = (courseKey) => {
    const isCurrentlyCollapsed = collapsedCourses.has(courseKey);
    if (isCurrentlyCollapsed) {
      setCollapsedCourses((prev) => {
        const next = new Set(prev);
        next.delete(courseKey);
        return next;
      });
    } else {
      setCollapsedCourses((prev) => new Set(prev).add(courseKey));
      const groupIdsInCourse = adminGroups
        .filter((g) => {
          const ck = g.course && [1, 2, 3, 4].includes(g.course) ? g.course : "none";
          return ck === courseKey;
        })
        .map((g) => g.id);
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        groupIdsInCourse.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleSaveUserFields = async () => {
    if (!selectedUser) return;
    const patch = {};
    if (userForm.username.trim() !== (selectedUser.username || "")) {
      patch.username = userForm.username.trim();
    }
    if (userForm.email !== (selectedUser.email || "")) patch.email = userForm.email;
    if (userForm.first_name !== (selectedUser.first_name || "")) patch.first_name = userForm.first_name;
    if (userForm.last_name !== (selectedUser.last_name || "")) patch.last_name = userForm.last_name;
    if (userForm.password && userForm.password.length > 0) {
      const pwdErr = validatePassword(userForm.password);
      if (pwdErr) { setMsg(pwdErr, "error"); return; }
      patch.password = userForm.password;
    }
    if (Object.keys(patch).length === 0) { setUserFormDirty(false); return; }
    const result = await updateUserFields(selectedUser.id, patch);
    if (result?.error) { setMsg(result.error, "error"); return; }
    if (result) {
      setMsg(patch.password ? "Сохранено. Пароль обновлён." : "Сохранено");
      setUserFormDirty(false);
      setUserForm((p) => ({ ...p, password: "" }));
      await fetchUsers();
    }
  };

  const handleCreateUser = async () => {
    const body = {
      username: userCreateForm.username.trim(),
      email: userCreateForm.email.trim(),
      password: userCreateForm.password,
      role: userCreateForm.role,
      first_name: userCreateForm.first_name.trim() || null,
      last_name: userCreateForm.last_name.trim() || null,
      group_id: userCreateForm.group_id ? Number(userCreateForm.group_id) : null,
    };
    if (!body.username || !body.email || !body.password) {
      setMsg("Заполни username, email и пароль", "error"); return;
    }
    const pwdErr = validatePassword(body.password);
    if (pwdErr) { setMsg(pwdErr, "error"); return; }
    const result = await createUser(body);
    if (result?.error) { setMsg(result.error, "error"); return; }
    if (result) {
      setMsg("Пользователь создан");
      await fetchUsers();
      selectUser(result.id);
    }
  };

  const handleChangeUserGroup = async (userId, groupId) => {
    const result = await updateUserGroup(userId, groupId);
    if (result === true) {
      fetchUsers();
      setMsg("Группа пользователя обновлена");
    } else {
      setMsg(result?.error || "Ошибка обновления группы", "error");
    }
  };

  // ── JSX слоты ──

  const sidebar = (
    <UsersSidebar
      groupsByCourse={groupsByCourse}
      adminGroups={adminGroups}
      users={users}
      noGroupUsers={noGroupUsers}
      editMode={editMode}
      selectedUserId={selectedUserId}
      selectedGroupId={selectedGroupId}
      selectedCourseKey={selectedCourseKey}
      userRole={userRole}
      collapsedCourses={collapsedCourses}
      collapsedGroups={collapsedGroups}
      toggleCourseCollapse={toggleCourseCollapse}
      toggleGroupCollapse={toggleGroupCollapse}
      selectUser={selectUser}
      selectGroupForEdit={selectGroupForEdit}
      selectCourse={selectCourse}
      handleDeleteGroup={handleDeleteGroup}
      openGroupCreate={openGroupCreate}
      openUserCreate={openUserCreate}
      onRefresh={refresh}
    />
  );

  const editor = (
    <>
      {editMode === "user" && selectedUser && (
        <UserEditor
          selectedUser={selectedUser}
          userRole={userRole}
          form={userForm}
          setForm={setUserForm}
          dirty={userFormDirty}
          setDirty={setUserFormDirty}
          editRoles={editRoles}
          tab={userEditorTab}
          setTab={setUserEditorTab}
          progressData={userProgress}
          progressLoading={userProgressLoading}
          expandedTab={progressExpandedTab}
          setExpandedTab={setProgressExpandedTab}
          groups={adminGroups}
          onSaveFields={handleSaveUserFields}
          onRoleChange={handleRoleChange}
          onSaveRole={handleSaveRole}
          onGroupChange={handleChangeUserGroup}
          onDelete={handleDeleteUser}
        />
      )}

      {editMode === "group" && selectedGroup && (
        <GroupEditor
          selectedGroup={selectedGroup}
          userRole={userRole}
          form={groupForm}
          setForm={setGroupForm}
          dirty={groupDirty}
          setDirty={setGroupDirty}
          tab={groupEditorTab}
          setTab={setGroupEditorTab}
          progress={groupProgress}
          progressLoading={groupProgressLoading}
          users={users}
          onSave={handleSaveGroup}
          onSelectUser={selectUser}
          onDelete={handleDeleteGroup}
        />
      )}

      {editMode === "course" && selectedCourseKey != null && (
        <CourseEditor
          courseKey={selectedCourseKey}
          label={selectedCourseKey === "none" ? "Без курса" : `${selectedCourseKey} курс`}
          groupsByCourse={groupsByCourse}
          users={users}
          onSelectGroup={selectGroupForEdit}
          onSelectUser={selectUser}
        />
      )}

      {editMode === "group-create" && (
        <GroupCreate
          form={groupCreateForm}
          setForm={setGroupCreateForm}
          onCreate={handleCreateGroupFromForm}
          onCancel={closeEditor}
        />
      )}

      {editMode === "user-create" && (
        <UserCreate
          form={userCreateForm}
          setForm={setUserCreateForm}
          currentRole={userRole}
          groups={adminGroups}
          onCreate={handleCreateUser}
          onCancel={closeEditor}
        />
      )}
    </>
  );

  return { sidebar, editor, refresh };
}
