/**
 * Утилиты для поиска: извлечение матча из FTS-сниппета и DOM-подсветка.
 * Используются в SiteHeader/HomePage (формирование URL) и LearnPage (подсветка).
 */

/**
 * Достать первое слово из <mark>...</mark> в сниппете ts_headline.
 * Возвращает строку (с stemming-окончанием PG-FTS, т.е. ровно как в реальном
 * контенте) или null если ничего не нашли.
 */
export function extractFirstMark(snippet) {
  if (!snippet || typeof snippet !== "string") return null;
  const m = snippet.match(/<mark>([^<]+)<\/mark>/);
  if (!m) return null;
  // Decode основных HTML-entities (на случай если в исходнике было &amp;)
  const text = m[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text.trim() || null;
}


/**
 * Найти все вхождения matchText в DOM rootEl (с учётом word-boundary
 * для кириллицы+латиницы), обернуть каждое в <mark class="search-hit">.
 *
 * Возвращает массив созданных <mark>-элементов — пригодится для
 * последующей очистки через unwrapHighlights().
 *
 * Игнорирует:
 *   - <pre> и <code> блоки (там обычно технические токены, не интересны для FTS)
 *   - <script>/<style> (на всякий)
 *   - вложенные <mark> (чтобы не двойной wrap при повторных вызовах)
 *
 * Word-boundary через Unicode property classes (\p{L}\p{N}) с флагом u —
 * нативный JS \b не понимает кириллицу.
 */
export function highlightInRoot(rootEl, matchText) {
  if (!rootEl || !matchText) return [];
  const escaped = matchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let re;
  try {
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  } catch {
    // Если браузер не поддерживает lookbehind или unicode flag —
    // fallback на простое substring matching без word-boundary.
    // (Это маловероятно — Chrome/Firefox/Safari/Edge давно поддерживают.)
    re = new RegExp(escaped, "gi");
  }

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p = node.parentElement;
      while (p && p !== rootEl) {
        const tag = p.tagName;
        if (tag === "PRE" || tag === "CODE" || tag === "SCRIPT" ||
            tag === "STYLE" || tag === "MARK") {
          return NodeFilter.FILTER_REJECT;
        }
        p = p.parentElement;
      }
      // Пропускаем пустые/whitespace-only ноды
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Сначала собираем все text-ноды, потом уже мутируем DOM.
  // Иначе walker сломается при первой же мутации.
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  const created = [];
  for (const tn of textNodes) {
    const text = tn.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;

    const fragments = [];
    let lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) {
        fragments.push(document.createTextNode(text.slice(lastIndex, m.index)));
      }
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = m[0];
      fragments.push(mark);
      created.push(mark);
      lastIndex = re.lastIndex;
      // Защита от zero-width матчей (на случай поломки regex)
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (lastIndex < text.length) {
      fragments.push(document.createTextNode(text.slice(lastIndex)));
    }

    const parent = tn.parentNode;
    if (!parent) continue;
    fragments.forEach((f) => parent.insertBefore(f, tn));
    parent.removeChild(tn);
  }

  return created;
}


/**
 * Снять подсветку: для каждого <mark.search-hit> вынуть содержимое наружу
 * и удалить сам элемент. parent.normalize() склеивает соседние text-ноды
 * обратно — иначе DOM остаётся фрагментированным.
 */
export function unwrapHighlights(highlights) {
  if (!highlights?.length) return;
  const parents = new Set();
  for (const mark of highlights) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parents.add(parent);
  }
  // normalize() склеивает adjacent text nodes — без этого в DOM остаются
  // куски типа <p>"foo"|"bar"|"baz"</p> вместо <p>"foobarbaz"</p>.
  for (const p of parents) p.normalize();
}
