import Markdown from "../../components/Markdown";
import MarkdownTextarea from "../../components/MarkdownTextarea";
import PythonEditor from "../../components/PythonEditor";
import TopicChildrenList from "./TopicChildrenList";
import { IconFlask, IconTrash } from "./Icons";
import { useTheme } from "../../contexts/useTheme";

/**
 * Редактор темы / подтемы / главы / урока / лабы.
 * Презентационный компонент — весь state приходит через props.
 */
export default function TopicEditor({
  form, setField, onTitle,
  editorView, setEditorView,
  autoSlug, setAutoSlug,
  parentOptions,
  dirty, saving,
  mdRef, formRef,
  onSave, onDelete, onClear,
  // Дочерние элементы (для вкладки "Главы" / "Уроки и вопросы")
  allTopics, allQuestions, onSelectTopic, onSelectQuestion,
  // Lab options manipulators (используются только при form.type === "lab")
  addLabOption, updateLabOptionField, removeLabOption,
}) {
  const isLab = form.type === "lab";
  const hasContent = form.type !== "theme" && form.type !== "subtopic";
  const charCount = (form.content || "").length;
  // Вкладка "дочерние" доступна только для уже созданных тем/подтем/глав
  // (у лабы и урока детей нет — у лабы есть свои опции, но не топики).
  const showChildrenTab = !!form.id && form.type !== "lesson" && form.type !== "lab";
  const childrenTabLabel = form.type === "chapter" ? "Уроки и вопросы" : "Главы";

  const isChoice = form.check_mode === "single_choice" || form.check_mode === "multiple_choice";
  const isPyCode = form.check_mode === "python_code";

  // Для lab заголовок зависит от режима проверки: python_code →
  // «практическое задание», остальные режимы → «лабораторная работа».
  const typeLabel = form.type === "lab"
    ? (isPyCode ? "практического задания" : "лабораторной работы")
    : { theme: "темы", subtopic: "подтемы", chapter: "главы", lesson: "урока" }[form.type];
  const { theme } = useTheme();

  return (
    <>
      <div className="ap-editor-header">
        <h2 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {isLab && <span style={{ color: "#10B981", display: "inline-flex" }}><IconFlask size={18}/></span>}
          {form.id ? "Редактирование" : "Создание"} {typeLabel}
        </h2>
        {dirty && <span style={{ fontSize: 11, color: "var(--foregroundAlt)", fontStyle: "italic" }}>(не сохранено)</span>}
        {form.title && (
          <span style={{ fontSize: 12, color: "var(--foregroundAlt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {form.title}{form.slug ? ` \u00b7 /${form.slug}` : ""}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="md-tabs" style={{ padding: "0 24px", flexShrink: 0 }}>
        <button type="button" className={`md-tab${editorView === "settings" ? " is-active" : ""}`} onClick={() => setEditorView("settings")}>
          Настройки
        </button>
        {hasContent && (
          <button type="button" className={`md-tab${editorView === "edit" ? " is-active" : ""}`} onClick={() => setEditorView("edit")}>
            Markdown{charCount > 0 && <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 4 }}>{charCount}</span>}
          </button>
        )}
        {hasContent && (
          <button type="button" className={`md-tab${editorView === "preview" ? " is-active" : ""}`} onClick={() => setEditorView("preview")}>
            Превью
          </button>
        )}
        {showChildrenTab && (
          <button type="button" className={`md-tab${editorView === "children" ? " is-active" : ""}`} onClick={() => setEditorView("children")}>
            {childrenTabLabel}
          </button>
        )}
      </div>

      <form ref={formRef} className="admin-form" onSubmit={onSave} style={{ display: "contents" }}>
        <div className="ap-editor-body">

          {/* TAB: Settings */}
          {editorView === "settings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Тип</span>
                  <select value={form.type} onChange={(e) => {
                    const type = e.target.value;
                    setField("type", type);
                    setField("parent_id", "");
                    if (type !== "lesson") setField("estimated_minutes", "");
                    if (type === "theme" || type === "subtopic") { setField("content", ""); setEditorView("settings"); }
                    // Если перешли с children-доступного типа на lesson/lab — закрываем вкладку children
                    if ((type === "lesson" || type === "lab") && editorView === "children") setEditorView("settings");
                  }}>
                    <option value="theme">Тема (Часть)</option>
                    <option value="subtopic">Подтема</option>
                    <option value="chapter">Глава</option>
                    <option value="lesson">Урок</option>
                    <option value="lab">Лаба (практика)</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                    Родитель ({
                      form.type === "theme" ? "нет"
                      : form.type === "subtopic" ? "тема"
                      : form.type === "chapter" ? "тема/подтема"
                      : form.type === "lesson" ? "глава"
                      : "тема/подтема/глава"
                    })
                  </span>
                  <select value={form.parent_id ?? ""} onChange={(e) => setField("parent_id", e.target.value)} disabled={form.type === "theme"}>
                    <option value="">{form.type === "theme" ? "(нет)" : "(выбрать)"}</option>
                    {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Заголовок</span>
                <input value={form.title} onChange={(e) => onTitle(e.target.value)} required/>
              </label>

              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Slug (обязателен)</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input style={{ flex: 1, minWidth: 0 }} value={form.slug}
                    onChange={(e) => { setAutoSlug(false); setField("slug", e.target.value); }} required/>
                  <input type="checkbox" checked={autoSlug} onChange={(e) => setAutoSlug(e.target.checked)} id="autoslug"/>
                  <label htmlFor="autoslug" style={{ fontSize: 12, color: "var(--foregroundAlt)", whiteSpace: "nowrap" }}>авто</label>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Order</span>
                  <input type="number" value={form.order} onChange={(e) => setField("order", e.target.value)}/>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Минуты</span>
                  <input type="number" value={form.estimated_minutes}
                    onChange={(e) => setField("estimated_minutes", e.target.value)}
                    disabled={form.type !== "lesson"}
                    placeholder={form.type === "lesson" ? "например 12" : "только для урока"}/>
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Summary</span>
                <input value={form.summary} onChange={(e) => setField("summary", e.target.value)}/>
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="checkbox" checked={form.is_published} onChange={(e) => setField("is_published", e.target.checked)}/>
                <span>Опубликовано</span>
              </label>

              {/* ── Lab-секция (видна только при type === "lab") ── */}
              {isLab && (
                <fieldset className="lab-fieldset">
                  <legend style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#10B981", fontWeight: 700 }}>
                    <IconFlask size={14}/> Параметры практики
                  </legend>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                      Ссылка на Google Colab
                      {isPyCode && (
                        <span style={{ marginLeft: 6, opacity: 0.7 }}>
                          (не требуется для python_code)
                        </span>
                      )}
                    </span>
                    <input
                      type="url"
                      value={form.colab_url}
                      onChange={(e) => setField("colab_url", e.target.value)}
                      placeholder={isPyCode
                        ? "Не нужно — задание выполняется в браузере"
                        : "https://colab.research.google.com/..."}
                      required={!isPyCode}
                      disabled={isPyCode}
                    />
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Режим проверки</span>
                      <select
                        value={form.check_mode || "text_exact"}
                        onChange={(e) => setField("check_mode", e.target.value)}
                      >
                        <option value="text_exact">Текстовый ответ (точное совпадение)</option>
                        <option value="numeric">Числовой ответ (с допуском)</option>
                        <option value="single_choice">Выбор одного из вариантов</option>
                        <option value="multiple_choice">Выбор нескольких вариантов</option>
                        <option value="python_code">Код на Python (Pyodide в браузере)</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                        Лимит попыток (пусто = без лимита)
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={form.max_attempts ?? ""}
                        onChange={(e) => setField("max_attempts", e.target.value)}
                        placeholder="например, 3"
                      />
                    </label>
                  </div>

                  {/* Поля по выбранному режиму */}
                  {form.check_mode === "text_exact" && (
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                        Ожидаемый ответ (без учёта регистра и пробелов)
                      </span>
                      <input
                        value={form.expected_answer ?? ""}
                        onChange={(e) => setField("expected_answer", e.target.value)}
                        placeholder="например: transformer"
                        required
                      />
                    </label>
                  )}

                  {form.check_mode === "numeric" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>Ожидаемое число</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form.expected_answer ?? ""}
                          onChange={(e) => setField("expected_answer", e.target.value)}
                          placeholder="например: 3.14"
                          required
                        />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                          Допуск ±
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form.numeric_tolerance ?? ""}
                          onChange={(e) => setField("numeric_tolerance", e.target.value)}
                          placeholder="0 (точно) или 0.01"
                        />
                      </label>
                    </div>
                  )}

                  {isPyCode && (
                    <div style={{ display: "grid", gap: 12 }}>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                          Стартовый код (показывается студенту в редакторе)
                        </span>
                        <PythonEditor
                          value={form.starter_code || ""}
                          onChange={(v) => setField("starter_code", v)}
                          theme={theme}
                          height="180px"
                        />
                      </label>

                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                          Код тестов (assert-блоки) — выполняется после кода студента, скрыт от него в v2
                        </span>
                        <PythonEditor
                          value={form.test_code || ""}
                          onChange={(v) => setField("test_code", v)}
                          theme={theme}
                          height="180px"
                        />
                        <span style={{ fontSize: 11, color: "var(--foregroundAlt)" }}>
                          Пример: <code>assert solve([1,2,3]) == 6</code>. Если все assert проходят — задача решена.
                        </span>
                      </label>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                            Пакеты для micropip (через запятую)
                          </span>
                          <input
                            value={form.required_packages_str || ""}
                            onChange={(e) => setField("required_packages_str", e.target.value)}
                            placeholder="numpy, pandas"
                          />
                          <span style={{ fontSize: 11, color: "var(--foregroundAlt)" }}>
                            Пусто = только stdlib. Допустимы: numpy, pandas, scipy, scikit-learn, matplotlib и т.п.
                          </span>
                        </label>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                            Таймаут (сек)
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={form.timeout_seconds ?? ""}
                            onChange={(e) => setField("timeout_seconds", e.target.value)}
                            placeholder="по умолчанию 5"
                          />
                          <span style={{ fontSize: 11, color: "var(--foregroundAlt)" }}>
                            Лимит выполнения. Для тяжёлых ML — до 30.
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {isChoice && (
                    <div className="lab-options-editor">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "var(--foregroundAlt)" }}>
                          Варианты ответа
                          {form.check_mode === "single_choice" ? " (отметьте ровно один правильный)" : " (отметьте все правильные)"}
                        </span>
                        <button type="button" className="btn-outline" onClick={addLabOption} style={{ fontSize: 12, padding: "4px 10px" }}>
                          + Вариант
                        </button>
                      </div>
                      {form.options?.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--foregroundAlt)", padding: "10px 0" }}>
                          Нажмите «+ Вариант» — нужно как минимум два.
                        </div>
                      )}
                      {(form.options || []).map((opt, idx) => (
                        <div key={opt.id ?? `new-${idx}`} className="lab-option-row">
                          <input
                            type={form.check_mode === "single_choice" ? "radio" : "checkbox"}
                            name="lab-correct-marker"
                            checked={!!opt.is_correct}
                            onChange={(e) => {
                              if (form.check_mode === "single_choice") {
                                // Радио: помечаем только этот, остальные снимаем
                                form.options.forEach((_, i) => {
                                  updateLabOptionField(i, "is_correct", i === idx ? e.target.checked : false);
                                });
                              } else {
                                updateLabOptionField(idx, "is_correct", e.target.checked);
                              }
                            }}
                            title="Правильный вариант"
                          />
                          <input
                            type="text"
                            value={opt.text}
                            onChange={(e) => updateLabOptionField(idx, "text", e.target.value)}
                            placeholder={`Вариант ${idx + 1}`}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          <button
                            type="button"
                            className="ap-icon-btn"
                            onClick={() => removeLabOption(idx)}
                            title="Удалить"
                          >
                            <IconTrash/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}
            </div>
          )}

          {/* TAB: Markdown — MarkdownTextarea даёт собственный undo/redo
              (Ctrl+Z / Ctrl+Y), нативный браузерный в controlled-textarea
              ненадёжен (рвётся при переключении вкладок). */}
          {editorView === "edit" && (
            <MarkdownTextarea ref={mdRef}
              style={{ width: "100%", height: "100%", minHeight: 200, resize: "none", boxSizing: "border-box", border: "1px solid var(--borderPrimary)", borderRadius: 6, padding: "8px 10px", font: "inherit", fontSize: 13 }}
              value={form.content}
              onChange={(e) => setField("content", e.target.value)}
              placeholder="# Заголовок&#10;&#10;Текст…"/>
          )}

          {/* TAB: Preview */}
          {editorView === "preview" && (
            <div className="lesson-body md-preview" style={{ border: "1px solid var(--borderPrimary)", borderRadius: 12, padding: 14, minHeight: 200, background: "var(--backgroundBase)" }}>
              <Markdown>{form.content || "_(пусто)_"}</Markdown>
            </div>
          )}

          {/* TAB: Children (главы темы / главы подтемы / уроки и вопросы главы) */}
          {editorView === "children" && showChildrenTab && (
            <TopicChildrenList
              topicId={form.id}
              topicType={form.type}
              allTopics={allTopics}
              allQuestions={allQuestions}
              onSelectTopic={onSelectTopic}
              onSelectQuestion={onSelectQuestion}
            />
          )}
        </div>
      </form>

      <div className="ap-editor-footer">
        <button className="btn-primary" type="button" disabled={saving} onClick={() => formRef.current?.requestSubmit()}>
          {saving ? "..." : form.id ? "Сохранить" : "Создать"}
        </button>
        {form.id ? (
          <button type="button" className="btn-outline" onClick={onDelete}>Удалить</button>
        ) : (
          <button type="button" className="btn-outline" onClick={onClear}>Очистить</button>
        )}
      </div>
    </>
  );
}
