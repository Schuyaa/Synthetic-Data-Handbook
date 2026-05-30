/**
 * Форма создания новой группы в редакторе админки.
 * Презентационный компонент: state и handlers приходят пропами.
 */
export default function GroupCreate({ form, setForm, onCreate, onCancel }) {
  return (
    <>
      <div className="ap-editor-header">
        <h2>Новая группа</h2>
      </div>
      <div className="ap-editor-body">
        <div className="ap-user-form">
          <div className="ap-field">
            <label>Название группы *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") onCreate(); }}
              placeholder="например ПИ-21"
              autoFocus
            />
          </div>
          <div className="ap-field">
            <label>Курс</label>
            <select
              value={form.course}
              onChange={(e) => setForm((p) => ({ ...p, course: e.target.value }))}
            >
              <option value="">Без курса</option>
              <option value="1">1 курс</option>
              <option value="2">2 курс</option>
              <option value="3">3 курс</option>
              <option value="4">4 курс</option>
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
