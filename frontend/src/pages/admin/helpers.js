/**
 * Pure helpers для AdminPage.
 */

export function slugify(input) {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Превратить плоский список топиков в дерево по parent_id */
export function buildTree(items) {
  const byId = new Map(items.map((t) => [t.id, { ...t, children: [] }]));
  const roots = [];
  for (const t of byId.values()) {
    if (t.parent_id && byId.has(t.parent_id)) byId.get(t.parent_id).children.push(t);
    else roots.push(t);
  }
  const sortRec = (node) => {
    node.children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
    node.children.forEach(sortRec);
  };
  roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
  roots.forEach(sortRec);
  return roots;
}

// filterByStatus / collectChapters раньше жили тут — удалены вместе с
// рефакторингом прогресса под единое дерево (lessons + labs + questions).
// Если что-то нужно — смотри src/utils/progress.js (buildProgressTree).

/** Цвет роли пользователя для UI */
export function roleColor(role) {
  if (role === "admin") return "#DC2626";
  if (role === "teacher") return "#D97706";
  return "#7C3AED"; // student
}
