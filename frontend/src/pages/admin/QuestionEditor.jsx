/**
 * Редактор вопроса и его вариантов ответов.
 */
export default function QuestionEditor({
  form, setQField,
  chapters, lessonTopics,
  toggleKind,
  onAddOption, onUpdateOption, onRemoveOption,
  onSave, onDelete, onClear,
}) {
  return (
    <>
      <div className="ap-editor-header">
        <h2>{form.id ? "Редактирование вопроса" : "Создание вопроса"}</h2>
      </div>

      <div className="ap-editor-body">
        <form className="admin-form" onSubmit={onSave}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Глава</span>
            <select value={form.chapter_id} onChange={(e) => setQField("chapter_id", e.target.value)} disabled={!!form.id}>
              <option value="">(выбрать главу)</option>
              {chapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Текст вопроса</span>
            <textarea style={{ minHeight: 80, resize: "vertical" }} value={form.text}
              onChange={(e) => setQField("text", e.target.value)} placeholder="Введите текст вопроса…" required/>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Order</span>
              <input type="number" value={form.order} onChange={(e) => setQField("order", e.target.value)}/>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Ссылка на урок (при ошибке)</span>
              <select value={form.reference_topic_id} onChange={(e) => setQField("reference_topic_id", e.target.value)}>
                <option value="">Без ссылки</option>
                {lessonTopics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={form.kind === "multiple"} onChange={(e) => toggleKind(e.target.checked)}/>
            <span style={{ fontSize: 13 }}>Несколько правильных ответов</span>
          </label>

          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Варианты ответов</span>
              <button className="btn-outline" type="button" onClick={onAddOption} style={{ fontSize: 12 }}>+ Вариант</button>
            </div>

            {form.options.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Нет вариантов. Добавь хотя бы два.</div>
            )}

            {form.options.map((opt, idx) => (
              <div key={opt.id || `new-${idx}`} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  type={form.kind === "multiple" ? "checkbox" : "radio"}
                  name="correct-option" checked={opt.is_correct}
                  onChange={(e) => onUpdateOption(idx, "is_correct", form.kind === "multiple" ? e.target.checked : true)}
                  title="Правильный ответ"
                  style={{ accentColor: "var(--green-brand)", flexShrink: 0 }}/>
                <input style={{ flex: 1 }} value={opt.text}
                  onChange={(e) => onUpdateOption(idx, "text", e.target.value)}
                  placeholder={`Вариант ${idx + 1}`}/>
                <button className="btn-outline" type="button" onClick={() => onRemoveOption(idx)}
                  style={{ padding: "4px 8px", fontSize: 12 }}>&#10005;</button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 6 }}>
            <button className="btn-primary" type="submit">{form.id ? "Сохранить" : "Создать"}</button>
            {form.id ? (
              <button type="button" className="btn-outline" onClick={onDelete}>Удалить</button>
            ) : (
              <button type="button" className="btn-outline" onClick={onClear}>Очистить</button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
