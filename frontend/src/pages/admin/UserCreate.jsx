import { PASSWORD_HINT } from "../../utils/validation";

/**
 * Форма создания нового пользователя в админке.
 * Роли teacher/admin доступны только для currentRole=="admin".
 */
export default function UserCreate({ form, setForm, currentRole, groups, onCreate, onCancel }) {
  return (
    <>
      <div className="ap-editor-header">
        <h2>Новый пользователь</h2>
      </div>
      <div className="ap-editor-body">
        <div className="ap-user-form">
          <div className="ap-field">
            <label>Имя пользователя *</label>
            <input
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              placeholder="username"
            />
          </div>
          <div className="ap-field">
            <label>Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="user@example.com"
            />
          </div>
          <div className="ap-field">
            <label>Пароль *</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder={PASSWORD_HINT}
            />
          </div>
          <div className="ap-field">
            <label>Фамилия</label>
            <input
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
            />
          </div>
          <div className="ap-field">
            <label>Имя</label>
            <input
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
            />
          </div>
          <div className="ap-field">
            <label>Роль</label>
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            >
              <option value="student">student</option>
              {currentRole === "admin" && <option value="teacher">teacher</option>}
              {currentRole === "admin" && <option value="admin">admin</option>}
            </select>
          </div>
          <div className="ap-field">
            <label>Группа</label>
            <select
              value={form.group_id}
              onChange={(e) => setForm((p) => ({ ...p, group_id: e.target.value }))}
            >
              <option value="">Без группы</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.course ? ` (${g.course} курс)` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="ap-editor-footer">
        <button type="button" className="btn-primary" onClick={onCreate}>
          Создать
        </button>
        <button type="button" className="btn-outline" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </>
  );
}
