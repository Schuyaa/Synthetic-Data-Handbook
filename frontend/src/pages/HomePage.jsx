import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import AuthModal from "../components/AuthModal";
import { fetchTree, fetchMyProgressFull, getCachedTree } from "../api/content";
import { fetchQuestionCounts } from "../api/quiz";
import { searchApi } from "../api/search";
import { extractFirstMark } from "../utils/search";
import { labTypeLabel, labTypeColor } from "../utils/labType";
import { useAuth } from "../contexts/useAuth";
import HeroCanvas from "../components/HeroCanvas";
import { HomePageSkeleton } from "../components/Skeletons";
import { sanitizeSnippet } from "../utils/sanitize";

function buildThemes(tree) {
  const themes = (tree || []).filter((n) => n?.kind === "section");
  return themes.map((t) => {
    // Прямые дети темы: chapters / subtopics / standalone-labs.
    // Имена `chapters`/`chapter` сохранены для обратной совместимости рендера —
    // фактически это «карточки» (chapter | lab).
    const directChildren = (t.children || []).filter(
      (n) => n.kind === "section" || n.kind === "subtopic" || n.kind === "lab",
    );
    const groups = [];
    for (const child of directChildren) {
      if (child.kind === "subtopic") {
        const chapters = (child.children || []).filter(
          (n) => n.kind === "section" || n.kind === "lab",
        );
        groups.push({ type: "subtopic", title: child.title, id: child.id, chapters });
      } else {
        groups.push({ type: "chapter", chapter: child });
      }
    }
    const allChapters = [];
    for (const g of groups) {
      if (g.type === "subtopic") allChapters.push(...g.chapters);
      else allChapters.push(g.chapter);
    }
    return { ...t, groups, chapters: allChapters };
  });
}

export default function HomePage() {
  const { user, logout, loginSuccess } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [activeSlug, setActiveSlug] = useState(null);
  // progressMap: { topic_id -> {status, updated_at} } — для уроков и лаб
  const [progressMap, setProgressMap] = useState({});
  // questionMap: { question_id -> {status, updated_at, chapter_id} }
  const [questionMap, setQuestionMap] = useState({});
  // chapterQuestionTotals: { chapter_id -> count } — total опубликованных вопросов
  const [chapterQuestionTotals, setChapterQuestionTotals] = useState({});
  const [lastLesson, setLastLesson] = useState(null);
  const [lastThemeProgress, setLastThemeProgress] = useState(null);
  const partEls = useRef(new Map());
  const tabsRef = useRef(null);
  const tabsWrapRef = useRef(null);
  const tabsSentinel = useRef(null);
  const scrollspyLocked = useRef(false);
  const [tabsStuck, setTabsStuck] = useState(false);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const navigate = useNavigate();

  // Hero search
  const [heroQ, setHeroQ] = useState("");
  const [heroResults, setHeroResults] = useState([]);
  const [heroSearching, setHeroSearching] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const heroPopRef = useRef(null);
  const heroInputRef = useRef(null);


  useEffect(() => {
    let alive = true;

    // setState внутри async IIFE — иначе сработает react-hooks/set-state-in-effect.
    (async () => {
      if (!alive) return;
      setLoading(true);
      setErr("");
      setProgressMap({});
      setQuestionMap({});
      setChapterQuestionTotals({});
      setLastLesson(null);
      setLastThemeProgress(null);

      try {
        const [t, prog, qCounts] = await Promise.all([
          fetchTree(),
          fetchMyProgressFull(),
          fetchQuestionCounts(),
        ]);
        if (!alive) return;

        const treeData = Array.isArray(t) ? t : [];
        setTree(treeData);
        setChapterQuestionTotals(qCounts || {});

        // Topic progress (lessons + labs)
        const pmap = {};
        for (const p of (prog?.topics || [])) {
          pmap[p.topic_id] = { status: p.status, updated_at: p.updated_at };
        }
        setProgressMap(pmap);

        // Question progress
        const qmap = {};
        for (const q of (prog?.questions || [])) {
          qmap[q.question_id] = {
            status: q.status,
            updated_at: q.updated_at,
            chapter_id: q.chapter_id,
          };
        }
        setQuestionMap(qmap);

        // Найти последний посещённый unit (lesson|lab) для блока «продолжить»
        let best = null;
        let bestThemeRef = null;
        for (const theme of treeData) {
          const dfs = (node, chapterCtx) => {
            // Глава — section с parent. Контекст для вложенных уроков
            // и сама кандидат для «продолжить чтение».
            const isChapter = node.kind === "section" && node.parent_id != null;
            const ctx = isChapter ? node : chapterCtx;

            const considerCandidate = (cand, updatedAt) => {
              if (!best || new Date(updatedAt) > new Date(best.updated_at)) {
                best = cand;
                bestThemeRef = theme;
              }
            };

            if (isChapter) {
              const pr = pmap[node.id];
              if (pr && pr.status !== "not_started") {
                considerCandidate({
                  slug: node.slug,
                  title: node.title,
                  chapterSlug: node.slug,
                  chapterTitle: node.title,
                  kind: "chapter",
                  updated_at: pr.updated_at,
                }, pr.updated_at);
              }
            }
            if ((node.kind === "lesson" || node.kind === "lab") && ctx) {
              const pr = pmap[node.id];
              if (pr && pr.status !== "not_started") {
                considerCandidate({
                  slug: node.slug,
                  title: node.title,
                  chapterSlug: ctx.slug,
                  chapterTitle: ctx.title,
                  kind: node.kind,
                  updated_at: pr.updated_at,
                }, pr.updated_at);
              }
            }
            (node.children || []).forEach((c) => dfs(c, ctx));
          };
          (theme.children || []).forEach((c) => dfs(c, null));
        }
        setLastLesson(best);

        // Прогресс темы где остановился: уроки + лабы + вопросы её глав.
        if (bestThemeRef) {
          let total = 0, done = 0;
          const stack = [...(bestThemeRef.children || [])];
          while (stack.length) {
            const n = stack.pop();
            if (n.kind === "lesson" || n.kind === "lab") {
              total++;
              if (pmap[n.id]?.status === "done") done++;
            }
            // Если это глава — добавляем total её вопросов + саму главу
            // как единицу прогресса (её текст-введение).
            if (n.kind === "section" && n.parent_id != null) {
              const cnt = (qCounts || {})[n.id] || 0;
              total += cnt;
              total++;
              if (pmap[n.id]?.status === "done") done++;
            }
            (n.children || []).forEach((c) => stack.push(c));
          }
          // done по вопросам — сумма done-статусов по q.chapter_id, попадающим в эту тему.
          // Дешевле: пройтись по qmap и проверить, что chapter_id принадлежит дереву темы.
          const themeChapterIds = new Set();
          {
            const ts = [...(bestThemeRef.children || [])];
            while (ts.length) {
              const x = ts.pop();
              if (x.kind === "section") themeChapterIds.add(x.id);
              (x.children || []).forEach((c) => ts.push(c));
            }
          }
          for (const q of Object.values(qmap)) {
            if (q.status === "done" && themeChapterIds.has(q.chapter_id)) done++;
          }
          setLastThemeProgress({
            themeTitle: bestThemeRef.title,
            total,
            done,
            pct: total ? Math.round((done / total) * 100) : 0,
          });
        }
      } catch {
        if (alive) setErr("Не удалось загрузить содержание.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  const themes = useMemo(() => buildThemes(tree), [tree]);

  // Прогресс темы: lessons + labs + questions её chapter'ов.
  const themeProgress = useMemo(() => {
    const result = {};
    for (const t of themes) {
      let total = 0, done = 0;
      const chapterIds = new Set();
      const stack = [...(t.children || [])];
      while (stack.length) {
        const n = stack.pop();
        if (n.kind === "lesson" || n.kind === "lab") {
          total++;
          if (progressMap[n.id]?.status === "done") done++;
        }
        if (n.kind === "section" && n.parent_id != null) {
          chapterIds.add(n.id);
          total += chapterQuestionTotals[n.id] || 0;
          // Глава = +1 единица прогресса (её текст-введение).
          total++;
          if (progressMap[n.id]?.status === "done") done++;
        }
        (n.children || []).forEach((c) => stack.push(c));
      }
      for (const q of Object.values(questionMap)) {
        if (q.status === "done" && chapterIds.has(q.chapter_id)) done++;
      }
      result[t.id] = { total, done };
    }
    return result;
  }, [themes, progressMap, questionMap, chapterQuestionTotals]);

  // Активная вкладка — derived в render, без useEffect+setState (set-state-in-effect).
  const effectiveActiveSlug = activeSlug ?? themes[0]?.slug ?? null;

  const openLogin = () => { setShowAuth(true); };
  const handleLogout = () => { logout(); };

  // Hero search: close on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (!heroOpen) return;
      if (heroPopRef.current?.contains(e.target)) return;
      if (heroInputRef.current?.contains(e.target)) return;
      setHeroOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [heroOpen]);

  const heroDebounceRef = useRef(null);
  const runHeroSearch = (val) => {
    setHeroQ(val);
    clearTimeout(heroDebounceRef.current);
    if (!val.trim()) { setHeroResults([]); return; }
    heroDebounceRef.current = setTimeout(async () => {
      setHeroSearching(true);
      try {
        const data = await searchApi(val, 8);
        setHeroResults(data.results || []);
      } catch { setHeroResults([]); }
      setHeroSearching(false);
    }, 300);
  };

  const heroGoTo = (r) => {
    setHeroOpen(false);
    setHeroQ("");
    setHeroResults([]);
    // ?match=... — слово из FTS-сниппета, передаём для подсветки на LearnPage
    const match = extractFirstMark(r.snippet);
    const matchParam = match ? `match=${encodeURIComponent(match)}` : "";
    if (r.target === "theme") {
      const el = document.getElementById(`part-${r.slug}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (r.target === "chapter") {
      navigate(`/chapter/${r.slug}${matchParam ? "?" + matchParam : ""}`);
    } else if (r.target === "lesson" && r.chapter_slug) {
      const qs = `?lesson=${encodeURIComponent(r.slug)}${matchParam ? "&" + matchParam : ""}`;
      navigate(`/chapter/${r.chapter_slug}${qs}`);
    }
  };

  const handleHeroSubmit = (e) => {
    e.preventDefault();
    if (heroResults.length) heroGoTo(heroResults[0]);
  };

  const scrollToPart = (slug) => {
    const el = partEls.current.get(slug);
    if (!el) return;
    scrollspyLocked.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    clearTimeout(scrollToPart._t);
    scrollToPart._t = setTimeout(() => { scrollspyLocked.current = false; }, 800);
  };

  useEffect(() => {
    if (loading) return;
    if (!themes.length) return;

    const els = themes.map((t) => partEls.current.get(t.slug)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        if (scrollspyLocked.current) return;

        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));
        if (!visible.length) return;

        const slug = visible[0].target.getAttribute("data-part-slug");
        if (!slug) return;

        setActiveSlug(slug);
        /* Auto-scroll to active tab when overflow mode */
        const strip = tabsRef.current;
        const btn = strip?.querySelector(`[data-tab-slug="${slug}"]`);
        if (btn && strip && strip.scrollWidth > strip.clientWidth + 2) {
          const left = btn.offsetLeft - strip.clientWidth / 2 + btn.clientWidth / 2;
          strip.scrollTo({ left, behavior: "smooth" });
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0.1, 0.2, 0.35, 0.5, 0.65] }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [loading, themes]);

  /* Detect when tabs become sticky */
  useEffect(() => {
    const sentinel = tabsSentinel.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      ([e]) => setTabsStuck(!e.isIntersecting),
      { threshold: 0, rootMargin: `-${getComputedStyle(document.documentElement).getPropertyValue("--header-h").trim() || "60px"} 0px 0px 0px` }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [loading]);

  /* Detect overflow for arrow buttons */
  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const check = () => setTabsOverflow(strip.scrollWidth > strip.clientWidth + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [loading, themes]);

  const scrollTabs = (dir) => {
    const strip = tabsRef.current;
    if (!strip) return;
    const tab = strip.querySelector(".lj-tab");
    const step = tab ? tab.offsetWidth : 200;
    strip.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <>
      <SiteHeader user={user} onLoginClick={openLogin} onLogout={handleLogout} />

      <div className="page-with-fixed-header">
        <div className="lj-hero">
            <HeroCanvas />
            <div className="hero-canvas-content">
              <div className="container">
                  <p className="hero-code-comment">{"// synthetic_data_handbook"}</p>
                  <h1 className="lj-h1">Учебник по синтетическим данным</h1>
                  <p className="lj-lead">
                    Интерактивный учебник по методам генерации синтетических данных: от классических
                    статистических подходов до современных генеративных моделей.
                  </p>

            {/* Hero search */}
            <form onSubmit={handleHeroSubmit} style={{ position: "relative", maxWidth: 540 }} ref={heroInputRef}>
              <div style={{
                display: "flex",
                border: "1px solid var(--borderPrimary)",
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--backgroundBase)",
              }}>
                <input
                  value={heroQ}
                  placeholder="Поиск по учебнику..."
                  onChange={(e) => { setHeroOpen(true); runHeroSearch(e.target.value); }}
                  onFocus={() => heroQ.trim() && setHeroOpen(true)}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    padding: "10px 14px",
                    fontSize: 14,
                    background: "transparent",
                  }}
                />
                <button
                  type="submit"
                  className="btn-search"
                  style={{ borderRadius: 0, padding: "10px 20px", fontSize: 14, flexShrink: 0 }}
                >
                  Найти
                </button>
              </div>

              {heroOpen && heroQ.trim() && (
                <div ref={heroPopRef} className="search-popover" style={{
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  width: "auto",
                }}>
                  {heroSearching ? (
                    <div className="search-empty">Ищем...</div>
                  ) : heroResults.length === 0 ? (
                    <div className="search-empty">Ничего не найдено.</div>
                  ) : (
                    heroResults.map((r) => (
                      <button
                        key={`${r.target}-${r.id}`}
                        type="button"
                        className="search-item"
                        onClick={() => heroGoTo(r)}
                        style={{ display: "block", width: "100%", cursor: "pointer" }}
                      >
                        <div style={{ fontWeight: 700 }}>{r.title}</div>
                        <div style={{ color: "var(--foregroundAlt)", fontSize: 12, marginTop: 2 }}>
                          {r.target === "theme" ? "Тема" : r.target === "chapter" ? "Глава" : "Урок"}
                        </div>
                        {r.snippet ? (
                          <div
                            style={{ fontSize: 12, color: "var(--foregroundAlt)", marginTop: 6, lineHeight: 1.35 }}
                            dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }}
                          />
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              )}
            </form>
              </div>
            </div>
        </div>

        <div className="lj-toc">
          <div className="container">
            {/* User activity block / registration CTA */}
            {user ? (
              lastLesson && (
                <div className="lj-cta-block" style={{
                  border: "1px solid var(--borderPrimary)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: lastThemeProgress ? 12 : 0 }}>
                    <div>
                      <div className="muted" style={{ marginBottom: 4 }}>
                        Продолжить чтение
                      </div>
                      <div style={{ fontWeight: 700 }}>{lastLesson.title}</div>
                      <div className="muted">
                        {lastLesson.kind === "chapter"
                          ? "Глава"
                          : `Глава: ${lastLesson.chapterTitle}`}
                      </div>
                    </div>
                    <Link
                      className="btn-primary"
                      to={lastLesson.kind === "chapter"
                        ? `/chapter/${lastLesson.slug}`
                        : `/chapter/${lastLesson.chapterSlug}?lesson=${encodeURIComponent(lastLesson.slug)}`}
                    >
                      Продолжить &rarr;
                    </Link>
                  </div>
                  {lastThemeProgress && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--foregroundAlt)", marginBottom: 4 }}>
                        <span>{lastThemeProgress.themeTitle}</span>
                        <span>{lastThemeProgress.done} / {lastThemeProgress.total} ({lastThemeProgress.pct}%)</span>
                      </div>
                      <div style={{ height: 8, background: "var(--borderPrimary)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${lastThemeProgress.pct}%`, background: "var(--foregroundAccent)", borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="lj-cta-block lj-cta-block--warm" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Войдите в систему</div>
                  <div style={{ fontSize: 14, color: "var(--foregroundAlt)" }}>
                    Чтобы отслеживать прогресс обучения, войдите под своей учётной записью.
                  </div>
                </div>
                <button className="btn-primary" onClick={openLogin}>
                  Войти
                </button>
              </div>
            )}

            <div className="lj-toc-head">
              <h2 className="lj-h2">Содержание</h2>
            </div>

            {loading ? (
              <HomePageSkeleton tree={getCachedTree()} />
            ) : err ? (
              <div className="lj-muted">{err}</div>
            ) : themes.length === 0 ? (
              <div className="lj-muted">Нет опубликованных тем.</div>
            ) : (
              <div className="fade-in">
                <div ref={tabsSentinel} className="lj-tabs-sentinel" />
                <div
                  ref={tabsWrapRef}
                  className={`lj-tabs-wrap${tabsStuck ? " is-stuck" : ""}${tabsOverflow ? " has-overflow" : ""}`}
                >
                  <button
                    className="lj-tabs-arrow lj-tabs-arrow--left"
                    onClick={() => scrollTabs(-1)}
                    aria-label="Предыдущая часть"
                  >&#8249;</button>
                  <div className="lj-tabs" ref={tabsRef}>
                    {themes.map((t, idx) => (
                      <a
                        key={t.id}
                        data-tab-slug={t.slug}
                        href={`#part-${t.slug}`}
                        className={`lj-tab ${effectiveActiveSlug === t.slug ? "is-active" : ""}`}
                        onClick={(e) => { e.preventDefault(); scrollToPart(t.slug); }}
                      >
                        <span className="lj-tab-kicker">{`Часть ${idx + 1}`}</span>
                        <span className="lj-tab-title">{t.title}</span>
                      </a>
                    ))}
                  </div>
                  <button
                    className="lj-tabs-arrow lj-tabs-arrow--right"
                    onClick={() => scrollTabs(1)}
                    aria-label="Следующая часть"
                  >&#8250;</button>
                </div>

                <div className="lj-parts">
                  {themes.map((t) => (
                    <section
                      key={t.id}
                      id={`part-${t.slug}`}
                      data-part-slug={t.slug}
                      ref={(el) => el && partEls.current.set(t.slug, el)}
                      className="lj-part"
                    >
                      <div className="lj-part-head">
                        <h2 className="lj-part-title">{t.title}</h2>
                        {user && themeProgress[t.id]?.total > 0 && (() => {
                          const tp = themeProgress[t.id];
                          const pct = Math.round((tp.done / tp.total) * 100);
                          return (
                            <div className="lj-theme-progress">
                              <span className="lj-theme-progress-label">{tp.done}/{tp.total}</span>
                              <div className="lj-theme-progress-track">
                                <div className="lj-theme-progress-fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      {t.summary ? <p className="lj-part-desc">{t.summary}</p> : null}

                      {t.groups?.length ? (() => {
                        // Колонки 1-3, ряды равной высоты, column-first order.
                        const gridCols = (n) =>
                          n <= 3 ? n : n % 3 === 0 ? 3 : n % 2 === 0 ? 2 : 3;

                        // minmax(0, 1fr) — иначе длинное слово не даёт колонке
                        // сжаться и ломает grid на узких экранах.
                        const colStyle = (n) => {
                          const cols = gridCols(n);
                          const rows = Math.ceil(n / cols);
                          return {
                            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${rows}, auto)`,
                            gridAutoFlow: "column",
                          };
                        };

                        // «Пройдена»: текст главы прочитан + все lessons +
                        // labs + questions внутри done. Текст главы —
                        // обязательная единица, поэтому глава без уроков
                        // тоже может стать «пройденной» (прочитал текст).
                        const isChapterDone = (node) => {
                          if (progressMap[node.id]?.status !== "done") return false;
                          let total = 1; // текст самой главы
                          const stack = [...(node.children || [])];
                          while (stack.length) {
                            const n = stack.pop();
                            if (n.kind === "lesson" || n.kind === "lab") {
                              total++;
                              if (progressMap[n.id]?.status !== "done") return false;
                            }
                            (n.children || []).forEach((c) => stack.push(c));
                          }
                          // Вопросы: смотрим, сколько done у этой главы
                          const qTotal = chapterQuestionTotals[node.id] || 0;
                          if (qTotal > 0) {
                            let qDone = 0;
                            for (const q of Object.values(questionMap)) {
                              if (q.chapter_id === node.id && q.status === "done") qDone++;
                            }
                            if (qDone < qTotal) return false;
                            total += qTotal;
                          }
                          return total > 0;
                        };

                        // Для значка-колбы на карточке главы.
                        const hasLabs = (node) =>
                          (node.children || []).some((n) => n.kind === "lab");

                        const renderCard = (c) => {
                          const isLab = c.kind === "lab";
                          const done = user && (isLab
                            ? progressMap[c.id]?.status === "done"
                            : isChapterDone(c));
                          const showFlask = isLab || hasLabs(c);
                          const to = isLab ? `/lab/${c.slug}` : `/chapter/${c.slug}`;
                          return (
                            <Link
                              key={c.id}
                              className={`lj-chapter-card${done ? " is-done" : ""}${isLab ? " is-lab" : ""}`}
                              to={to}
                            >
                              <div className="lj-chapter-card-text">
                                {/* Тип задания: «Практическое задание» / «Лабораторная работа» */}
                                {isLab && (
                                  <div
                                    className="lj-chapter-card-kicker"
                                    style={{ color: labTypeColor(c.check_mode) }}
                                  >
                                    {labTypeLabel(c.check_mode)}
                                  </div>
                                )}
                                <div className="lj-chapter-card-title">
                                  {showFlask && (
                                    <span
                                      className="lj-chapter-card-flask"
                                      title={isLab ? labTypeLabel(c.check_mode) : "Глава содержит практику"}
                                    >
                                      <FlaskHomeIcon/>
                                    </span>
                                  )}
                                  {c.title}
                                </div>
                                {c.summary && <div className="lj-chapter-card-summary">{c.summary}</div>}
                              </div>
                              {done
                                ? <span className="lj-chapter-card-check">&#10003;</span>
                                : <span className="lj-chapter-card-arrow">&rsaquo;</span>}
                            </Link>
                          );
                        };

                        // Group consecutive direct chapters into batches
                        const blocks = [];
                        let batch = [];
                        for (const g of t.groups) {
                          if (g.type === "subtopic") {
                            if (batch.length) { blocks.push({ type: "batch", items: batch }); batch = []; }
                            blocks.push(g);
                          } else {
                            batch.push(g.chapter);
                          }
                        }
                        if (batch.length) blocks.push({ type: "batch", items: batch });

                        return (
                          <div style={{ display: "grid", gap: 14 }}>
                            {blocks.map((b) => {
                              if (b.type === "subtopic") {
                                return (
                                  <div key={b.id}>
                                    <div className="lj-subtopic-header">{b.title}</div>
                                    <div className="lj-chapters-grid" style={colStyle(b.chapters.length)}>
                                      {b.chapters.map(renderCard)}
                                    </div>
                                  </div>
                                );
                              }
                              return (
                                <div key={`batch-${b.items[0].id}`} className="lj-chapters-grid" style={colStyle(b.items.length)}>
                                  {b.items.map(renderCard)}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })() : (
                        <div className="lj-muted">В этой части нет опубликованных глав.</div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <span className="footer-logo">Synthetic Data Handbook</span>
              <span className="footer-copy">© 2026</span>
            </div>
            <nav className="footer-nav">
              <Link to="/">Содержание</Link>
              {user && <Link to="/user">Профиль</Link>}
              {user?.role === "admin" && <Link to="/admin">Панель управления</Link>}
            </nav>
            <div className="footer-meta">
              ПГНИУ · Электронный учебник
            </div>
          </div>
        </footer>
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthSuccess={loginSuccess}
        />
      )}
    </>
  );
}

/** Inline-SVG колбы — чтобы не тянуть admin/Icons на публичной странице. */
function FlaskHomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h6"/>
      <path d="M10 3v6.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.5V3"/>
      <line x1="7.5" y1="14" x2="16.5" y2="14"/>
    </svg>
  );
}