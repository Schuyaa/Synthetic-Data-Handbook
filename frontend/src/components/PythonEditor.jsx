/**
 * PythonEditor — обёртка над @uiw/react-codemirror.
 *
 * Зачем отдельный компонент:
 *   1. Не таскать импорты CodeMirror по всему коду — здесь одна точка входа.
 *   2. Дефолты под наш проект (тема, размер, basicSetup) — чтобы каждый
 *      кто захочет редактор не думал про indentWithTab/closeBrackets и т.д.
 *   3. Если когда-то поменяем editor (например, на Monaco) — меняется
 *      только этот файл, остальные не знают про детали.
 *
 * Тема:
 *   - "light" → дефолт CodeMirror (белый фон)
 *   - "dark"  → @codemirror/theme-one-dark (тёмно-серый, как VS Code)
 *
 * indentWithTab=true (default у @uiw/react-codemirror) — Tab делает
 * отступ внутри редактора. Без него Tab уводил бы фокус на след. элемент.
 */

import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

export default function PythonEditor({
  value,
  onChange,
  theme = "light",
  editable = true,
  height = "320px",
}) {
  return (
    <CodeMirror
      value={value}
      height={height}
      // Без lineWrapping: длинные строки скроллятся горизонтально (стандартное
      // поведение IDE). Видимый горизонтальный + вертикальный scrollbar
      // настраиваются через CSS (см. .cm-scroller в learn.css).
      extensions={[python()]}
      theme={theme === "dark" ? oneDark : "light"}
      editable={editable}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: true,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
        tabSize: 4,
      }}
    />
  );
}
