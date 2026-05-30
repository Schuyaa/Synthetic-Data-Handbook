/**
 * MarkdownTextarea — textarea с собственным undo/redo-стеком.
 *
 * Зачем: нативный браузерный Ctrl+Z в controlled React-textarea
 * ненадёжен. История браузера сбрасывается при размонтировании
 * (переключение вкладок Markdown/Превью/Настройки) и при программных
 * изменениях value (загрузка топика, сброс формы). Этот компонент
 * ведёт собственный стек снимков.
 *
 * Группировка: подряд идущий ввод складывается в одну undo-точку.
 * Новая точка создаётся после паузы > COMMIT_DELAY мс — иначе Ctrl+Z
 * откатывал бы по одному символу.
 *
 * Хоткеи:
 *   Ctrl/Cmd + Z              — undo
 *   Ctrl/Cmd + Y              — redo
 *   Ctrl/Cmd + Shift + Z      — redo
 *
 * API совместимо с <textarea>: value, onChange, плюс любые props
 * (style, placeholder, …) пробрасываются. forwardRef отдаёт наружу
 * сам DOM-узел textarea.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

const COMMIT_DELAY = 400;   // мс паузы в наборе для новой undo-точки
const MAX_HISTORY = 100;    // ограничение глубины стека (защита памяти)

const MarkdownTextarea = forwardRef(function MarkdownTextarea(
  { value, onChange, onKeyDown, ...rest },
  ref,
) {
  const taRef = useRef(null);
  // Внешний ref (mdRef из админки) получает сам DOM-узел textarea.
  useImperativeHandle(ref, () => taRef.current, []);

  // Стеки снимков: { value, selStart, selEnd }
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  // Последнее значение, которое ОТПРАВИЛИ мы сами (через onChange).
  // Нужно чтобы отличить наш ввод от внешнего изменения value.
  const lastEmitted = useRef(value);
  // Время последнего пользовательского ввода — для группировки.
  const lastInputAt = useRef(0);

  // Внешнее изменение value (загрузка другого топика, reset формы) —
  // сбрасываем историю, иначе undo откатил бы к содержимому чужого топика.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      undoStack.current = [];
      redoStack.current = [];
      lastEmitted.current = value;
    }
  }, [value]);

  const makeSnapshot = () => ({
    value: lastEmitted.current,
    selStart: taRef.current?.selectionStart ?? 0,
    selEnd: taRef.current?.selectionEnd ?? 0,
  });

  const handleChange = (e) => {
    const next = e.target.value;
    const now = Date.now();
    // Группировка: предыдущее состояние пушим в undo-стек только если
    // прошла пауза (новая «порция» ввода) или стек ещё пуст.
    if (now - lastInputAt.current > COMMIT_DELAY || undoStack.current.length === 0) {
      undoStack.current.push(makeSnapshot());
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    }
    lastInputAt.current = now;
    redoStack.current = [];   // новый ввод инвалидирует redo-ветку
    lastEmitted.current = next;
    onChange(e);
  };

  const restore = (snap) => {
    // Помечаем как «наше» изменение ДО onChange — чтобы useEffect выше
    // не принял его за внешнее и не сбросил историю.
    lastEmitted.current = snap.value;
    onChange({ target: { value: snap.value } });
    // Курсор восстанавливаем после ре-рендера. clamp на длину value —
    // снимок мог хранить позицию для более длинного текста.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      const len = snap.value.length;
      ta.focus();
      ta.setSelectionRange(
        Math.min(snap.selStart, len),
        Math.min(snap.selEnd, len),
      );
    });
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    redoStack.current.push(makeSnapshot());
    restore(undoStack.current.pop());
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(makeSnapshot());
    restore(redoStack.current.pop());
  };

  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <textarea
      ref={taRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      {...rest}
    />
  );
});

export default MarkdownTextarea;
