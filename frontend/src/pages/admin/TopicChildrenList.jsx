/**
 * TopicChildrenList — вкладка с дочерними элементами в TopicEditor.
 *
 * В зависимости от типа выбранного topic'а показывает разный контент:
 *  - theme    → подтемы (с вложенными главами) + прямые главы
 *  - subtopic → прямые главы
 *  - chapter  → уроки + вопросы
 *
 * Везде:
 *  - Поиск по названию
 *  - Кнопка-стрелка для перехода в редактор соответствующего элемента
 *  - Сворачиваемые группы (как в CourseEditor)
 */

import { useState, useMemo } from "react";
import { IconArrowRight, TreeChevron } from "./Icons";

const COLOR_SUBTOPIC = "#5B8CB8";
const COLOR_CHAPTER = "#D97706";
const COLOR_LESSON = "#7C3AED";
const COLOR_QUESTION = "#9CA3AF";

function nameMatches(text, q) {
  if (!q) return true;
  return (text || "").toLowerCase().includes(q);
}

/** Строка одного элемента с цветной точкой и кнопкой-стрелкой.
 *  Раньше кликабельна была только тонкая arrow-кнопка справа — визуальный
 *  hover-фон всего ряда вводил в заблуждение («вижу подсветку, кликаю —
 *  ничего»). Теперь navigation срабатывает при клике по любой точке ряда;
 *  кнопка-стрелка остаётся визуальным affordance'ом + фокус для клавиатуры. */
function ItemRow({ color, title, slug, isPublished, isQuestion, onClick }) {
  const onKeyDown = (e) => {
    // Enter / Space — стандартная a11y-механика для role="button"
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <div
      className="ap-course-user-item is-clickable"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      title="Открыть"
    >
      <span className="admin-tree-kind-dot" style={{ background: color }} aria-hidden="true"/>
      <span className="ap-course-user-name">
        {title || (slug && <span style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>/{slug}</span>)}
        {!isQuestion && isPublished === false && (
          <span title="черновик" style={{ marginLeft: 6, color: "#D97706", fontSize: 10 }}>● черновик</span>
        )}
        {!isQuestion && slug && (
          <span style={{ color: "var(--foregroundAlt)", marginLeft: 8, fontSize: 11, fontFamily: "monospace" }}>
            /{slug}
          </span>
        )}
      </span>
      {/* stopPropagation чтобы клик по стрелке не триггерил ещё и обработчик
          ряда — поведение идентично, но лишний пересчёт React не нужен. */}
      <button
        type="button"
        className="ap-link-btn"
        title="Открыть"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      >
        <IconArrowRight/>
      </button>
    </div>
  );
}

/** Сворачиваемая секция (заголовок + содержимое) */
function CollapsibleBlock({ color, title, count, hasChildren, collapsed, onToggle, onArrow, children }) {
  return (
    <div className="ap-course-group-block">
      <div
        className="ap-course-group-header"
        onClick={() => hasChildren && onToggle()}
        style={{ cursor: hasChildren ? "pointer" : "default" }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="admin-tree-toggle"
            title={collapsed ? "Развернуть" : "Свернуть"}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <TreeChevron collapsed={collapsed}/>
          </button>
        ) : (
          <span className="admin-tree-toggle-spacer"/>
        )}
        <span className="admin-tree-kind-dot" style={{ background: color }} aria-hidden="true"/>
        <span className="ap-course-group-name">{title}</span>
        <span className="admin-tree-count">{count}</span>
        {onArrow && (
          <button type="button" className="ap-link-btn" title="Открыть" onClick={(e) => { e.stopPropagation(); onArrow(); }}>
            <IconArrowRight/>
          </button>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}

export default function TopicChildrenList({
  topicId,
  topicType,            // "theme" | "subtopic" | "chapter"
  allTopics,
  allQuestions,
  onSelectTopic,
  onSelectQuestion,
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(new Set());
  const q = query.trim().toLowerCase();

  const toggle = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Сборка списка детей в зависимости от типа ────────────────
  const data = useMemo(() => {
    if (topicType === "theme") {
      // 1) Прямые главы темы (parent_id = topicId, kind = section)
      const directChapters = allTopics.filter(
        (t) => t.kind === "section" && t.parent_id === topicId,
      );
      // 2) Подтемы темы (parent_id = topicId, kind = subtopic)
      const subtopics = allTopics
        .filter((t) => t.kind === "subtopic" && t.parent_id === topicId)
        .map((sub) => ({
          ...sub,
          chapters: allTopics.filter(
            (t) => t.kind === "section" && t.parent_id === sub.id,
          ),
        }));
      return { kind: "theme", directChapters, subtopics };
    }
    if (topicType === "subtopic") {
      const chapters = allTopics.filter(
        (t) => t.kind === "section" && t.parent_id === topicId,
      );
      return { kind: "subtopic", chapters };
    }
    if (topicType === "chapter") {
      const lessons = allTopics.filter(
        (t) => t.kind === "lesson" && t.parent_id === topicId,
      );
      const questions = (allQuestions || []).filter((q) => q.chapter_id === topicId);
      return { kind: "chapter", lessons, questions };
    }
    return null;
  }, [topicId, topicType, allTopics, allQuestions]);

  if (!data) return null;

  // ── Рендер по типу ───────────────────────────────────────────

  if (data.kind === "theme") {
    const visibleDirect = data.directChapters.filter((c) => nameMatches(c.title, q));
    const visibleSubtopics = data.subtopics
      .map((s) => {
        const subMatches = nameMatches(s.title, q);
        const matchedChapters = q
          ? s.chapters.filter((c) => nameMatches(c.title, q))
          : s.chapters;
        if (!q || subMatches || matchedChapters.length > 0) {
          return { ...s, visibleChapters: q && !subMatches ? matchedChapters : s.chapters };
        }
        return null;
      })
      .filter(Boolean);

    const totalChapters = data.directChapters.length
      + data.subtopics.reduce((sum, s) => sum + s.chapters.length, 0);
    const isEmpty = data.directChapters.length === 0 && data.subtopics.length === 0;

    return (
      <div>
        <SearchHeader
          query={query} setQuery={setQuery} q={q}
          totalCount={totalChapters}
          countLabel="глав"
          visibleCount={visibleDirect.length + visibleSubtopics.reduce((s, x) => s + x.visibleChapters.length, 0)}
        />

        {isEmpty ? (
          <EmptyState>В этой теме пока нет глав и подтем</EmptyState>
        ) : (visibleDirect.length === 0 && visibleSubtopics.length === 0) ? (
          <EmptyState>Ничего не найдено</EmptyState>
        ) : (
          <div className="ap-course-groups-list">
            {/* Прямые главы — ItemRow без обёртки */}
            {visibleDirect.length > 0 && (
              <div className="ap-course-group-block">
                <div className="ap-course-user-list">
                  {visibleDirect.map((c) => (
                    <ItemRow
                      key={c.id} color={COLOR_CHAPTER}
                      title={c.title} slug={c.slug} isPublished={c.is_published}
                      onClick={() => onSelectTopic(c.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Подтемы с вложенными главами */}
            {visibleSubtopics.map((s) => {
              const isCollapsed = !q && collapsed.has(`sub-${s.id}`);
              const has = s.visibleChapters.length > 0;
              return (
                <CollapsibleBlock
                  key={s.id}
                  color={COLOR_SUBTOPIC}
                  title={s.title}
                  count={s.visibleChapters.length}
                  hasChildren={has}
                  collapsed={isCollapsed}
                  onToggle={() => toggle(`sub-${s.id}`)}
                  onArrow={() => onSelectTopic(s.id)}
                >
                  {has ? (
                    <div className="ap-course-user-list">
                      {s.visibleChapters.map((c) => (
                        <ItemRow
                          key={c.id} color={COLOR_CHAPTER}
                          title={c.title} slug={c.slug} isPublished={c.is_published}
                          onClick={() => onSelectTopic(c.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyInline>В подтеме пока нет глав</EmptyInline>
                  )}
                </CollapsibleBlock>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (data.kind === "subtopic") {
    const visible = data.chapters.filter((c) => nameMatches(c.title, q));
    return (
      <div>
        <SearchHeader
          query={query} setQuery={setQuery} q={q}
          totalCount={data.chapters.length} countLabel="глав"
          visibleCount={visible.length}
        />
        {data.chapters.length === 0 ? (
          <EmptyState>В этой подтеме пока нет глав</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState>Ничего не найдено</EmptyState>
        ) : (
          <div className="ap-course-user-list" style={{ border: "1px solid var(--borderPrimary)", borderRadius: 8, overflow: "hidden" }}>
            {visible.map((c) => (
              <ItemRow
                key={c.id} color={COLOR_CHAPTER}
                title={c.title} slug={c.slug} isPublished={c.is_published}
                onClick={() => onSelectTopic(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (data.kind === "chapter") {
    const visibleLessons = data.lessons.filter((l) => nameMatches(l.title, q));
    const visibleQuestions = data.questions.filter((qn) => nameMatches(qn.text, q));
    const totalCount = data.lessons.length + data.questions.length;
    const visibleCount = visibleLessons.length + visibleQuestions.length;
    const lessonsBlockCollapsed = !q && collapsed.has("lessons");
    const questionsBlockCollapsed = !q && collapsed.has("questions");

    return (
      <div>
        <SearchHeader
          query={query} setQuery={setQuery} q={q}
          totalCount={totalCount} countLabel="элементов"
          visibleCount={visibleCount}
        />

        {totalCount === 0 ? (
          <EmptyState>В главе пока нет уроков и вопросов</EmptyState>
        ) : visibleCount === 0 ? (
          <EmptyState>Ничего не найдено</EmptyState>
        ) : (
          <div className="ap-course-groups-list">
            {(visibleLessons.length > 0) && (
              <CollapsibleBlock
                color={COLOR_LESSON}
                title="Уроки"
                count={visibleLessons.length}
                hasChildren={visibleLessons.length > 0}
                collapsed={lessonsBlockCollapsed}
                onToggle={() => toggle("lessons")}
              >
                <div className="ap-course-user-list">
                  {visibleLessons.map((l) => (
                    <ItemRow
                      key={l.id} color={COLOR_LESSON}
                      title={l.title} slug={l.slug} isPublished={l.is_published}
                      onClick={() => onSelectTopic(l.id)}
                    />
                  ))}
                </div>
              </CollapsibleBlock>
            )}

            {(visibleQuestions.length > 0) && (
              <CollapsibleBlock
                color={COLOR_QUESTION}
                title="Вопросы"
                count={visibleQuestions.length}
                hasChildren={visibleQuestions.length > 0}
                collapsed={questionsBlockCollapsed}
                onToggle={() => toggle("questions")}
              >
                <div className="ap-course-user-list">
                  {visibleQuestions.map((qn) => (
                    <ItemRow
                      key={qn.id} color={COLOR_QUESTION}
                      title={qn.text} isQuestion
                      onClick={() => onSelectQuestion(qn.id)}
                    />
                  ))}
                </div>
              </CollapsibleBlock>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function SearchHeader({ query, setQuery, q, totalCount, countLabel, visibleCount }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <input
        type="text" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по названию…"
        style={{
          width: "100%", padding: "8px 12px",
          border: "1px solid var(--borderPrimary)", borderRadius: 6,
          font: "inherit", fontSize: 13,
        }}
      />
      {q && (
        <div style={{ fontSize: 11, color: "var(--foregroundAlt)", marginTop: 4 }}>
          Найдено: {visibleCount} из {totalCount} {countLabel}
        </div>
      )}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div style={{ color: "var(--foregroundAlt)", fontSize: 13, padding: 24, textAlign: "center" }}>
      {children}
    </div>
  );
}

function EmptyInline({ children }) {
  return (
    <div style={{ color: "var(--foregroundAlt)", fontSize: 12, padding: "6px 12px 6px 28px" }}>
      {children}
    </div>
  );
}
