/** Свернуть число в правильное склонение «вопрос(а/ов)». */
function pluralQuestions(n) {
  const tens = Math.abs(n) % 100;
  const ones = tens % 10;
  if (tens >= 11 && tens <= 14) return "вопросов";
  if (ones === 1) return "вопрос";
  if (ones >= 2 && ones <= 4) return "вопроса";
  return "вопросов";
}

export function buildProgressTree({ tree, topicMap, questionMap, chapterQTotals }) {
  const result = [];
  for (const theme of tree || []) {
    if (theme.kind !== "section" || theme.parent_id != null) continue;

    const chapters = [];

    const themeLabs = (theme.children || []).filter((n) => n.kind === "lab");
    if (themeLabs.length > 0) {
      chapters.push({
        kind: "standalone-labs",
        title: "Практика и лабораторные темы",
        slug: theme.slug,
        id: `theme-${theme.id}-labs`,
        items: themeLabs.map((l) => ({
          type: l.check_mode === "python_code" ? "practice" : "lab",
          id: l.id, slug: l.slug, title: l.title,
          status: topicMap[l.id]?.status || "not_started",
        })),
      });
    }

    // Главы темы (через подтемы тоже)
    const collect = (node) => {
      if (node.kind === "section" && node.parent_id != null) {
        const lessons = [];
        const labs = [];
        for (const c of (node.children || [])) {
          if (c.kind === "lesson") lessons.push(c);
          else if (c.kind === "lab") labs.push(c);
        }
        const items = [];
        items.push({
          type: "chapter-text",
          id: `chapter-text-${node.id}`,
          title: "Текст главы",
          status: topicMap[node.id]?.status || "not_started",
          chapterSlug: node.slug,
        });
        for (const l of lessons) {
          items.push({
            type: "lesson", id: l.id, slug: l.slug, title: l.title,
            status: topicMap[l.id]?.status || "not_started",
            chapterSlug: node.slug,
          });
        }
        for (const l of labs) {
          items.push({
            type: l.check_mode === "python_code" ? "practice" : "lab",
            id: l.id, slug: l.slug, title: l.title,
            status: topicMap[l.id]?.status || "not_started",
          });
        }
        // Вопросы — известные (отвечал) и stub для не начатых
        const knownQs = Object.values(questionMap).filter((q) => q.chapter_id === node.id);
        for (const q of knownQs) {
          items.push({
            type: "question",
            id: q.question_id,
            title: q.question_text || `Вопрос #${q.question_id}`,
            status: q.status,
            chapterSlug: node.slug,
          });
        }
        const total = chapterQTotals[node.id] || 0;
        const known = knownQs.length;
        if (total > known) {
          const diff = total - known;
          items.push({
            type: "questions-stub",
            id: `q-stub-${node.id}`,
            title: `${diff} не начат${diff === 1 ? "ый" : "ых"} ${pluralQuestions(diff)}`,
            status: "not_started",
            chapterSlug: node.slug,
            count: diff,
          });
        }
        if (items.length > 0) {
          chapters.push({ kind: "chapter", id: node.id, title: node.title, slug: node.slug, items });
        }
      }
      if (node.kind === "subtopic") {
        for (const c of (node.children || [])) collect(c);
      }
    };
    for (const c of (theme.children || [])) collect(c);

    if (chapters.length > 0) {
      result.push({ id: theme.id, title: theme.title, slug: theme.slug, chapters });
    }
  }
  return result;
}

/** Подсчёт суммарной статистики прогресса (lessons + labs + questions). */
export function computeProgressStats({ tree, topicMap, questionMap, chapterQTotals }) {
  let total = 0, done = 0, inProgress = 0;

  const stack = [...(tree || [])];
  while (stack.length) {
    const n = stack.pop();
    if (n.kind === "lesson" || n.kind === "lab") {
      total++;
      const st = topicMap[n.id]?.status;
      if (st === "done") done++;
      else if (st === "in_progress") inProgress++;
    }
    if (n.kind === "section" && n.parent_id != null) {
      total++;
      const st = topicMap[n.id]?.status;
      if (st === "done") done++;
      else if (st === "in_progress") inProgress++;
    }
    (n.children || []).forEach((c) => stack.push(c));
  }
  for (const cnt of Object.values(chapterQTotals || {})) total += cnt;
  for (const q of Object.values(questionMap || {})) {
    if (q.status === "done") done++;
    else if (q.status === "in_progress") inProgress++;
  }

  return {
    total, done, inProgress,
    notStarted: Math.max(0, total - done - inProgress),
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

/** Куда ведёт клик по элементу прогресса. */
export function progressItemHref(item) {
  // practice и lab — оба Topic kind="lab", страница /lab/:slug
  if (item.type === "lab" || item.type === "practice") return `/lab/${item.slug}`;
  if (item.type === "lesson" && item.chapterSlug) {
    return `/chapter/${item.chapterSlug}?lesson=${encodeURIComponent(item.slug)}`;
  }
  if (
    (item.type === "question" || item.type === "questions-stub" || item.type === "chapter-text")
    && item.chapterSlug
  ) {
    return `/chapter/${item.chapterSlug}`;
  }
  return null;
}

/** Утилита: иконка для статуса. */
export function statusIcon(st) {
  if (st === "done") return "✔";
  if (st === "in_progress") return "◐";
  return "○";
}

/** Бейдж типа элемента (lesson / lab / question). Возвращает {label, color}. */
export function progressTypeBadge(type) {
  const m = {
    lesson: { label: "Урок", color: "#7C3AED" },
    practice: { label: "Практика", color: "#10B981" },
    lab: { label: "Лаба", color: "#0891B2" },
    question: { label: "Вопрос", color: "#9CA3AF" },
    "questions-stub": { label: "Вопросы", color: "#9CA3AF" },
    "chapter-text": { label: "Глава", color: "#D97706" },
  };
  return m[type] || { label: type, color: "#9CA3AF" };
}
