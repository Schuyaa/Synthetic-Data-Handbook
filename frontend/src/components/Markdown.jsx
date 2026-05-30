/**
 * Markdown с GFM + syntax highlighting + copy-button + LaTeX (KaTeX) +
 * inline-SVG.
 *
 * <Markdown>       — полный режим (тело главы/урока, инструкция лабы).
 *                    Поддерживает сырой HTML, в частности inline-<svg>
 *                    для диаграмм. HTML санитизируется (см. ниже).
 * <MarkdownInline> — для строки (вопросы, опции). <p> → <span>, без <pre>.
 *                    Inline-math работает; display-math выдаст блок.
 *                    Сырой HTML НЕ поддерживается — меньше attack surface
 *                    там, где он и не нужен.
 *
 * Конвейер rehype-плагинов для <Markdown>:
 *   rehypeRaw      — парсит сырой HTML из content (включая <svg>);
 *   rehypeSanitize — чистит распарсенный HTML по markdownSchema
 *                    (whitelist SVG-тегов, вырезает <script>, on*-хендлеры);
 *   rehypeKatex    — рендерит формулы $...$;
 *   rehypeHighlight — подсветка синтаксиса в code-блоках.
 * Порядок важен: санитизируется ТОЛЬКО авторский HTML. KaTeX и highlight
 * добавляют свою разметку уже ПОСЛЕ sanitize — это доверенный код,
 * трансформирующий текст (формулы, подсветку), не пользовательский HTML.
 *
 * KaTeX CSS подключается один раз в src/main.jsx.
 * Цвета подсветки — в src/styles/code-highlight.css.
 * rehype-katex strict-режим: \href с javascript: не выполнит.
 */

import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";

import { markdownSchema } from "../utils/markdownSanitizeSchema";

/**
 * Склеить пустые строки ВНУТРИ каждого <svg>...</svg>.
 *
 * Зачем: CommonMark трактует <svg> как HTML-блок (type 7) и обрывает
 * его на ПЕРВОЙ пустой строке. Авторы же вставляют SVG с пустыми
 * строками между секциями для читаемости — из-за этого <svg>
 * распадается на куски, а графика-теги (<rect>, <text>, <line>)
 * вываливаются в документ как обычный текст.
 *
 * Решение: убираем пустые строки только внутри <svg>...</svg>,
 * снаружи Markdown не трогаем. После этого remark видит SVG как
 * единый неразрывный HTML-блок.
 */
function collapseBlankLinesInSvg(md) {
  if (!md || md.indexOf("<svg") === -1) return md;
  return md.replace(/<svg[\s\S]*?<\/svg>/gi, (block) =>
    // одна или более whitespace-only строк → один перевод строки
    block.replace(/[ \t]*\r?\n(?:[ \t]*\r?\n)+/g, "\n"),
  );
}

/** Блок кода с кнопкой копирования. */
function CodeBlock({ children, ...rest }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);

  const onCopy = async () => {
    const text = preRef.current?.innerText || "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* пользователь отклонил доступ к clipboard, либо http-context */
    }
  };

  return (
    <div className="md-codeblock">
      <pre ref={preRef} {...rest}>{children}</pre>
      <button
        type="button"
        className={`md-copy-btn${copied ? " is-copied" : ""}`}
        onClick={onCopy}
        title={copied ? "Скопировано" : "Копировать"}
      >
        {copied ? "✓" : "⧉"}
      </button>
    </div>
  );
}

export default function Markdown({ children }) {
  // Препроцессинг: склеиваем пустые строки внутри <svg>, иначе CommonMark
  // разрывает SVG-блок на первой пустой строке (см. collapseBlankLinesInSvg).
  const source = collapseBlankLinesInSvg(children || "");
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      // Порядок: raw (распарсить HTML) → sanitize (вычистить) →
      // katex → highlight. См. шапку файла.
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize, markdownSchema],
        rehypeKatex,
        rehypeHighlight,
      ]}
      components={{ pre: CodeBlock }}
    >
      {source}
    </ReactMarkdown>
  );
}

/** Inline-вариант для вопросов/опций — <p> → <span>, без блоков <pre>. */
export function MarkdownInline({ children, as = "span" }) {
  const Wrap = as;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // _node нужно отфильтровать — иначе попадёт в DOM как unknown prop
        p: ({ node: _node, ...props }) => <Wrap {...props} />,
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {children || ""}
    </ReactMarkdown>
  );
}
