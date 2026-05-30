/**
 * StructureSidebar — левая колонка админки в режиме «Структура».
 *
 * Содержит:
 *  - Header с кнопкой обновления
 *  - Quick-create кнопки (+ Тема / Подтема / Глава / Урок / Вопрос)
 *  - Дерево контента: темы → подтемы → главы → уроки + вопросы внутри глав
 *
 * Полностью презентационный — все данные и колбэки приходят через props.
 */

import { IconRefresh, IconFlask } from "./Icons";
import { labTypeShort, labTypeColor, labTypeLabel } from "../../utils/labType";

function renderNode(node, depth, ctx) {
  const {
    editMode, selectedId, selectedQuestionId, collapsedIds,
    toggleCollapse, selectTopic, selectQuestion,
  } = ctx;

  const isQuestion = node._isQuestion;
  const active = isQuestion
    ? (editMode === "question" && selectedQuestionId === node._questionId)
    : (editMode === "topic" && node.id === selectedId);
  const hasChildren = node.children?.length > 0;
  const collapsed = collapsedIds.has(node.id);

  let label = "Глава";
  let typeColor = "#D97706";
  if (isQuestion) { label = "Вопрос"; typeColor = "#9CA3AF"; }
  else if (node.kind === "lab") {
    // python_code → «Практика», colab-режимы → «Лаба»
    label = labTypeShort(node.check_mode);
    typeColor = labTypeColor(node.check_mode);
  }
  else if (node.kind === "lesson") { label = "Урок"; typeColor = "#7C3AED"; }
  else if (node.kind === "subtopic") { label = "Подтема"; typeColor = "#5B8CB8"; }
  else if (!node.parent_id) { label = "Тема"; typeColor = "#2A7D6E"; }

  const tooltipParts = [label, node.title];
  if (!isQuestion) {
    tooltipParts.push(`/${node.slug}`);
    tooltipParts.push(node.is_published ? "опубликовано" : "черновик");
    tooltipParts.push(`order ${node.order ?? 0}`);
  }
  const tooltip = tooltipParts.join(" · ");

  return (
    <div key={node.id} className="admin-tree-node">
      <div
        className={`admin-tree-row${active ? " is-active" : ""}${isQuestion ? " is-question" : ""}${!isQuestion && !node.is_published ? " is-draft" : ""}`}
        onClick={() => isQuestion ? selectQuestion(node._questionId) : selectTopic(node.id)}
        onDoubleClick={(e) => {
          // Двойной клик по строке — развернуть/свернуть подуровень.
          // Клик по самой стрелке игнорируем (у неё свой обработчик,
          // иначе нечётное число тогглов даст неожиданное состояние).
          if (e.target.closest(".admin-tree-toggle")) return;
          if (!hasChildren) return;
          // Двойной клик авто-выделяет слово в заголовке — убираем выделение.
          window.getSelection()?.removeAllRanges();
          toggleCollapse(node.id, e);
        }}
        style={{ paddingLeft: 6 + depth * 12 }}
        title={tooltip}
      >
        {hasChildren ? (
          <button
            type="button"
            className="admin-tree-toggle"
            onClick={(e) => toggleCollapse(node.id, e)}
            aria-label={collapsed ? "Развернуть" : "Свернуть"}
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        ) : (
          <span className="admin-tree-toggle-spacer"/>
        )}

        <span className="admin-tree-kind-dot" style={{ background: typeColor }} aria-hidden="true"/>

        {node.kind === "lab" && (
          <span style={{ color: typeColor, display: "inline-flex" }} title={labTypeLabel(node.check_mode)}>
            <IconFlask size={12}/>
          </span>
        )}

        <span className={`admin-tree-title${isQuestion ? " is-question" : ""}`}>
          {node.title || <span className="admin-tree-slug-inline">/{node.slug}</span>}
        </span>

        {!isQuestion && !node.is_published && (
          <span className="admin-tree-draft-mark" title="черновик">●</span>
        )}
      </div>
      {hasChildren && !collapsed && (
        <div className="admin-tree-children">
          {node.children.map((c) => renderNode(c, depth + 1, ctx))}
        </div>
      )}
    </div>
  );
}

export default function StructureSidebar({
  // Data
  tree,
  // Selection state
  editMode, selectedId, selectedQuestionId,
  // Collapse state
  collapsedIds, toggleCollapse,
  // Selection handlers
  selectTopic, selectQuestion,
  // Quick create handlers
  createTheme, createSubtopic, createChapter, createLesson, createLab, createQuestionForm,
  // Refresh handlers
  onRefresh,
}) {
  const ctx = {
    editMode, selectedId, selectedQuestionId, collapsedIds,
    toggleCollapse, selectTopic, selectQuestion,
  };

  return (
    <>
      <div className="ap-side-header">
        <span className="ap-side-title">Структура</span>
        <div className="ap-side-actions">
          <button className="ap-icon-btn" title="Обновить" onClick={onRefresh}>
            <IconRefresh/>
          </button>
        </div>
      </div>

      <div className="ap-create-buttons">
        <button className="btn-outline" type="button" onClick={createTheme}>+ Тема</button>
        <button className="btn-outline" type="button" onClick={createSubtopic}>+ Подтема</button>
        <button className="btn-outline" type="button" onClick={createChapter}>+ Глава</button>
        <button className="btn-outline" type="button" onClick={createLesson}>+ Урок</button>
        <button className="btn-outline" type="button" onClick={createLab} title="Практическое задание или лабораторная работа — тип задаётся режимом проверки">
          <span style={{ display: "inline-flex", verticalAlign: "-2px", marginRight: 4, color: "#10B981" }}>
            <IconFlask size={11}/>
          </span>
          Лаба
        </button>
        <button className="btn-outline" type="button" onClick={createQuestionForm}>+ Вопрос</button>
      </div>

      <div className="ap-side-scroll">
        {tree.length ? tree.map((n) => renderNode(n, 0, ctx)) : (
          <div style={{ color: "var(--foregroundAlt)", fontSize: 13, padding: "12px 8px" }}>
            Пока нет тем. Нажми &laquo;+ Тема&raquo;.
          </div>
        )}
      </div>
    </>
  );
}
