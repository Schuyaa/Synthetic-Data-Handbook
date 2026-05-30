/** Skeleton placeholders for loading states */

/** Собрать главы внутри темы (рекурсивно) */
function collectChaptersFromTheme(theme) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.kind === "section" && n.parent_id != null) out.push(n);
      else if (n.children) walk(n.children);
    }
  };
  walk(theme.children);
  return out;
}

/**
 * @param tree — закэшированное дерево тем (если есть).
 * Если передано — рисуем точное количество тем и глав без текста.
 */
export function HomePageSkeleton({ tree } = {}) {
  const themes = tree && tree.length
    ? tree.filter((t) => t.kind === "section" && t.parent_id == null)
    : null;

  const themeShapes = themes
    ? themes.map((t) => ({ id: t.id, chapters: collectChaptersFromTheme(t).length }))
    : [
        { id: "_1", chapters: 6 },
        { id: "_2", chapters: 4 },
        { id: "_3", chapters: 3 },
      ];

  return (
    <div className="lj-toc" style={{ minHeight: "calc(100vh - var(--header-h))", paddingBottom: 80 }}>
      <div className="container">
        {/* CTA block skeleton */}
        <div className="skeleton-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-line skeleton-line--short" style={{ height: 12, marginBottom: 8 }} />
            <div className="skeleton skeleton-line skeleton-line--medium" style={{ height: 18 }} />
          </div>
          <div className="skeleton" style={{ width: 120, height: 38, borderRadius: "var(--radius-6)", flexShrink: 0 }} />
        </div>

        {/* Section title */}
        <div className="skeleton skeleton-title" style={{ width: 140, marginBottom: 20 }} />

        {/* Tabs — по реальному числу тем */}
        <div style={{ display: "flex", border: "1px solid var(--borderPrimary)", borderRadius: "var(--radius-8)", overflow: "hidden", marginBottom: 24 }}>
          {themeShapes.map((t) => (
            <div key={t.id} className="skeleton skeleton-tab" />
          ))}
        </div>

        {/* Темы — реальное количество, реальное количество глав в каждой */}
        {themeShapes.map((theme, ti) => (
          <div key={theme.id} style={{ marginTop: ti === 0 ? 0 : 32 }}>
            <div className="skeleton skeleton-title" style={{ width: "35%", marginBottom: 12 }} />
            <div className="skeleton skeleton-line" style={{ width: "55%", height: 13, marginBottom: 16 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
              {Array.from({ length: theme.chapters || 1 }).map((_, i) => (
                <div key={i} className="skeleton skeleton-chapter" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @param chapterNode — узел главы из дерева (если уже загружено).
 * Если передан — рисуем точное количество карточек уроков (без заголовков).
 */
export function LearnPageSkeleton({ chapterNode } = {}) {
  const lessonsCount = chapterNode
    ? (chapterNode.children || []).filter((c) => c.kind === "lesson").length
    : 3;

  return (
    <div className="chapter-layout">
      <main className="chapter-content">
        <div className="chapter-content-inner">
          {/* Chapter intro */}
          <div className="skeleton-card" style={{ padding: "28px 30px" }}>
            <div className="skeleton skeleton-title" style={{ width: "60%", height: 24, marginBottom: 16 }} />
            <div className="skeleton skeleton-line skeleton-line--full" />
            <div className="skeleton skeleton-line skeleton-line--long" />
            <div className="skeleton skeleton-line skeleton-line--medium" />
            <div className="skeleton skeleton-line skeleton-line--short" style={{ marginBottom: 0 }} />
          </div>

          {/* Lessons — реальное количество карточек */}
          {Array.from({ length: lessonsCount || 1 }).map((_, i) => (
            <div key={i} className="skeleton-card" style={{ padding: "28px 30px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div className="skeleton skeleton-title" style={{ width: "45%", marginBottom: 0 }} />
                <div className="skeleton" style={{ width: 50, height: 14, borderRadius: "var(--radius-6)" }} />
              </div>
              <div className="skeleton skeleton-line skeleton-line--full" />
              <div className="skeleton skeleton-line skeleton-line--long" />
              <div className="skeleton skeleton-line skeleton-line--full" />
              <div className="skeleton skeleton-line skeleton-line--medium" style={{ marginBottom: 0 }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export function UserPageSkeleton() {
  return (
    <div className="user-page">
      <div className="user-card" style={{ padding: "36px 40px" }}>
        {/* Profile */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20 }}>
          <div className="skeleton skeleton-avatar" />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-title" style={{ width: "40%", height: 20, marginBottom: 8 }} />
            <div className="skeleton skeleton-line skeleton-line--medium" style={{ height: 13, marginBottom: 4 }} />
            <div className="skeleton skeleton-line skeleton-line--short" style={{ height: 13, marginBottom: 0 }} />
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <div className="skeleton-card" style={{ marginBottom: 0 }}>
            <div className="skeleton skeleton-line skeleton-line--short" style={{ height: 13, marginBottom: 12 }} />
            <div className="skeleton skeleton-line skeleton-line--long" style={{ height: 14 }} />
            <div className="skeleton skeleton-line skeleton-line--medium" style={{ height: 14, marginBottom: 0 }} />
          </div>
          <div className="skeleton-card" style={{ marginBottom: 0 }}>
            <div className="skeleton skeleton-line skeleton-line--short" style={{ height: 13, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: 100, height: 36, borderRadius: "var(--radius-6)" }} />
          </div>
        </div>

        {/* Progress block */}
        <div className="skeleton-card" style={{ marginBottom: 0 }}>
          <div className="skeleton skeleton-title" style={{ width: "35%", marginBottom: 16 }} />
          <div className="skeleton skeleton-bar" style={{ marginBottom: 16 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: "var(--radius-12)" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Сплющить дерево в плоский список {depth} для скелетона.
 *  С ограничением: показываем не глубже maxDepth и не больше maxRows записей. */
function flattenTreeForSkeleton(nodes, depth = 0, out = [], maxDepth = 2, maxRows = 14) {
  for (const n of nodes || []) {
    if (out.length >= maxRows) return out;
    out.push({ id: n.id, depth });
    if (n.children?.length && depth < maxDepth) {
      flattenTreeForSkeleton(n.children, depth + 1, out, maxDepth, maxRows);
    }
  }
  return out;
}

/**
 * Skeleton админ-панели — повторяет VS Code-layout:
 * Activity Bar (48px) + Side Panel (300px) + Editor (flex).
 *
 * @param tree — закэшированное дерево топиков (если есть). Если передано —
 *   скелетон рисует ряды с реальной формой структуры (не идентично точно,
 *   но даёт правильный feel-и-shape). Без кэша — generic 10 рядов.
 */
export function AdminPageSkeleton({ tree } = {}) {
  const rows = tree && tree.length
    ? flattenTreeForSkeleton(tree)
    : Array.from({ length: 10 }, (_, i) => ({ id: `_${i}`, depth: i === 0 ? 0 : (i % 3 === 0 ? 0 : (i % 3 === 1 ? 1 : 2)) }));

  // Один ряд дерева — повторяет .admin-tree-row (24px высоты, chevron + dot + title)
  const TreeRow = ({ depth }) => (
    <div
      className="admin-tree-row"
      style={{
        paddingLeft: 6 + depth * 12,
        cursor: "default",
        // Варьируем ширину title чтобы выглядело live
        minHeight: 24,
      }}
    >
      <span className="admin-tree-toggle-spacer" />
      <span
        className="skeleton"
        style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }}
      />
      <span
        className="skeleton skeleton-line"
        style={{
          height: 12,
          width: `${50 + ((depth * 13) % 35)}%`,
          marginBottom: 0,
          flex: "0 1 auto",
        }}
      />
    </div>
  );

  return (
    <div className="ap-layout" aria-busy="true">
      {/* ═══ Activity Bar ═══ */}
      <nav className="ap-activity-bar">
        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "var(--radius-6, 6px)", margin: "8px 0 4px" }} />
        <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "var(--radius-6, 6px)" }} />
      </nav>

      {/* ═══ Side Panel ═══ */}
      <aside className="ap-side-panel" style={{ width: 300 }}>
        {/* Header */}
        <div className="ap-side-header">
          <div className="skeleton" style={{ width: 90, height: 12, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: 22, height: 22, borderRadius: 4 }} />
        </div>

        {/* Quick-create buttons (5 штук как в structure view) */}
        <div className="ap-create-buttons">
          {[58, 72, 60, 56, 70].map((w, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ width: w, height: 26, borderRadius: 4 }}
            />
          ))}
        </div>

        {/* Tree rows */}
        <div className="ap-side-scroll">
          {rows.map((r) => <TreeRow key={r.id} depth={r.depth} />)}
        </div>
      </aside>

      {/* ═══ Editor Panel ═══ */}
      <main className="ap-editor-panel">
        {/* Header */}
        <div className="ap-editor-header">
          <div className="skeleton skeleton-title" style={{ width: 220, height: 18, marginBottom: 0 }} />
          <div className="skeleton" style={{ width: 90, height: 11, borderRadius: 4 }} />
        </div>

        {/* Tabs */}
        <div className="md-tabs" style={{ padding: "0 24px", flexShrink: 0 }}>
          <div className="skeleton" style={{ width: 78, height: 28, borderRadius: 4, marginRight: 4 }} />
          <div className="skeleton" style={{ width: 90, height: 28, borderRadius: 4, marginRight: 4 }} />
          <div className="skeleton" style={{ width: 70, height: 28, borderRadius: 4 }} />
        </div>

        {/* Body — имитация формы редактирования */}
        <div className="ap-editor-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Два инпута в ряд */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="skeleton" style={{ width: 50, height: 11, marginBottom: 6, borderRadius: 3 }} />
                <div className="skeleton" style={{ height: 32, borderRadius: 6 }} />
              </div>
              <div>
                <div className="skeleton" style={{ width: 70, height: 11, marginBottom: 6, borderRadius: 3 }} />
                <div className="skeleton" style={{ height: 32, borderRadius: 6 }} />
              </div>
            </div>

            {/* Один большой инпут (заголовок) */}
            <div>
              <div className="skeleton" style={{ width: 80, height: 11, marginBottom: 6, borderRadius: 3 }} />
              <div className="skeleton" style={{ height: 32, borderRadius: 6 }} />
            </div>

            {/* Slug */}
            <div>
              <div className="skeleton" style={{ width: 100, height: 11, marginBottom: 6, borderRadius: 3 }} />
              <div className="skeleton" style={{ height: 32, borderRadius: 6 }} />
            </div>

            {/* Markdown-textarea placeholder */}
            <div className="skeleton" style={{ height: 220, borderRadius: 6, marginTop: 8 }} />
          </div>
        </div>

        {/* Footer */}
        <div className="ap-editor-footer">
          <div className="skeleton" style={{ width: 110, height: 32, borderRadius: 6 }} />
          <div className="skeleton" style={{ width: 90, height: 32, borderRadius: 6 }} />
        </div>
      </main>
    </div>
  );
}

export function UserProgressSkeleton() {
  return (
    <div style={{ width: "70vw", maxWidth: 900, margin: "0 auto", paddingTop: 48 }}>
      <div style={{
        background: "var(--backgroundBase)", borderRadius: "var(--radius-16)",
        boxShadow: "var(--shadow-popover)", padding: "40px 48px",
        display: "flex", flexDirection: "column", gap: 28,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div className="skeleton" style={{ width: 60, height: 60, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-title" style={{ width: "35%", height: 22, marginBottom: 8 }} />
            <div className="skeleton skeleton-line skeleton-line--medium" style={{ height: 13, marginBottom: 0 }} />
          </div>
        </div>

        {/* Progress block */}
        <div className="skeleton-card" style={{ marginBottom: 0 }}>
          <div className="skeleton skeleton-title" style={{ width: "30%", marginBottom: 16 }} />
          <div className="skeleton skeleton-bar" style={{ marginBottom: 16 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: "var(--radius-10)" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
