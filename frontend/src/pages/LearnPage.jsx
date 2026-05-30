import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import SiteHeader from "../components/SiteHeader";
import AuthModal from "../components/AuthModal";

import Markdown, { MarkdownInline } from "../components/Markdown";

import { fetchTree, fetchTopic, fetchMyProgress, setProgress, getCachedTree } from "../api/content";
import { labTypeShort } from "../utils/labType";
import { fetchQuestionsForChapter, checkSingleQuestion, fetchMyAnswers } from "../api/quiz";
import { useAuth } from "../contexts/useAuth";
import { LearnPageSkeleton } from "../components/Skeletons";
import { highlightInRoot, unwrapHighlights } from "../utils/search";

/** DFS find node by slug in tree */
function findNodeBySlug(tree, slug) {
  const stack = [...(tree || [])];
  while (stack.length) {
    const n = stack.pop();
    if (n.slug === slug) return n;
    (n.children || []).forEach((c) => stack.push(c));
  }
  return null;
}

/** Find theme parent of chapter (handles subtopics) and list all chapters in theme */
function findThemeAndChapters(tree, chapterNode) {
  if (!chapterNode?.parent_id) return { theme: null, chapters: [] };

  // Direct parent could be a theme or a subtopic
  let theme = (tree || []).find((t) => t.id === chapterNode.parent_id) || null;

  // If parent is a subtopic, walk up one level to find the theme
  if (theme && theme.kind === "subtopic") {
    theme = (tree || []).find((t) => t.id === theme.parent_id) || null;
  }
  // If parent is not a root theme, search deeper
  if (!theme && chapterNode.parent_id) {
    for (const t of (tree || [])) {
      const found = (t.children || []).find((c) => c.id === chapterNode.parent_id);
      if (found) { theme = t; break; }
    }
  }

  if (!theme) return { theme: null, chapters: [] };

  // Collect all chapters (sections) from the theme, recursing through subtopics
  const chapters = [];
  const collect = (nodes) => {
    for (const n of nodes) {
      if (n.kind === "subtopic") {
        collect(n.children || []);
      } else if (n.kind === "section") {
        chapters.push(n);
      }
    }
  };
  collect(theme.children || []);

  chapters.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
  return { theme, chapters };
}

/** Build flat ordered list of all chapters across all themes */
function buildAllChapters(tree) {
  const all = [];
  for (const theme of (tree || [])) {
    if (theme.kind !== "section") continue;
    const collect = (nodes) => {
      for (const n of nodes) {
        if (n.kind === "subtopic") collect(n.children || []);
        else if (n.kind === "section") all.push(n);
      }
    };
    collect(theme.children || []);
  }
  return all;
}

export default function LearnPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Header auth state (via AuthContext)
  const { user, logout, loginSuccess } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  // Data
  const [tree, setTree] = useState([]);
  const [chapterNode, setChapterNode] = useState(null);
  const [chapterContent, setChapterContent] = useState("");

  const [lessons, setLessons] = useState([]); // children lesson nodes
  const [lessonContents, setLessonContents] = useState({}); // slug -> markdown

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // UI
  const [q, setQ] = useState("");
  const [activeLessonSlug, setActiveLessonSlug] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 860);

  const lessonEls = useRef(new Map()); // slug -> element
  const navRef = useRef(null);

  // Progress tracking
  const [progressMap, setProgressMap] = useState({}); // topicId -> {status, updated_at}
  const trackedRef = useRef(new Set()); // prevents duplicate API calls
  const lessonEndEls = useRef(new Map()); // slug -> sentinel element
  // Прогресс самой главы (её текст-введение): секция + нижний sentinel
  const chapterIntroRef = useRef(null);
  const chapterIntroEndRef = useRef(null);
  // Доля прочитанного текста главы (0..1) по скроллу — для плавного
  // движения прогресс-бара, пока глава ещё не завершена.
  const [chapterReadFraction, setChapterReadFraction] = useState(0);

  // used to avoid repeated auto-scroll for same ?lesson=...
  const lastAutoLessonRef = useRef(null);

  // Активные search-подсветки от ?match=... — храним чтобы снять их и
  // отменить таймер при следующей навигации / unmount.
  const searchHighlightsRef = useRef([]);
  const searchTimeoutRef = useRef(null);

  // Lock scrollspy during programmatic scroll to prevent intermediate highlights
  const scrollspyLocked = useRef(false);

  // Quiz state (per-question)
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState({});       // qid -> number[]
  const [questionResults, setQuestionResults] = useState({}); // qid -> QuizResultItem
  const [questionSubmitting, setQuestionSubmitting] = useState({}); // qid -> bool

  const openLogin = () => {
    setShowAuth(true);
  };

  const handleLogout = () => {
    logout();
  };

  // Load chapter page
  useEffect(() => {
    let alive = true;

    // Refs (не state — правило не срабатывает) сбрасываем сразу.
    lessonEls.current = new Map();
    lessonEndEls.current = new Map();
    trackedRef.current = new Set();
    lastAutoLessonRef.current = null;

    (async () => {
      // setState внутри async IIFE — иначе set-state-in-effect.
      if (!alive) return;
      setLoading(true);
      setErr("");
      setTree([]);
      setChapterNode(null);
      setChapterContent("");
      setLessons([]);
      setLessonContents({});
      setActiveLessonSlug(null);
      setQ("");
      setQuizQuestions([]);
      setQuizAnswers({});
      setQuestionResults({});
      setQuestionSubmitting({});
      setChapterReadFraction(0); // сброс плавного прогресса при смене главы

      try {
        const t = await fetchTree();
        if (!alive) return;
        setTree(t);

        const node = findNodeBySlug(t, slug);
        if (!node || node.kind !== "section") {
          setErr("Глава не найдена (или не опубликована).");
          setLoading(false);
          return;
        }
        setChapterNode(node);

        // lessons = children with kind=lesson sorted
        const lessonNodes = (node.children || [])
          .filter((c) => c.kind === "lesson")
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);

        setLessons(lessonNodes);
        if (lessonNodes[0]) setActiveLessonSlug(lessonNodes[0].slug);

        // chapter markdown
        const ch = await fetchTopic(slug);
        if (!alive) return;
        setChapterContent(ch.content || "");

        // load lesson markdowns
        const pairs = await Promise.all(
          lessonNodes.map(async (ln) => {
            try {
              const data = await fetchTopic(ln.slug);
              return [ln.slug, data.content || ""];
            } catch {
              return [ln.slug, ""];
            }
          })
        );

        if (!alive) return;
        const map = {};
        for (const [s, c] of pairs) map[s] = c;
        setLessonContents(map);

        // Load user progress
        const prog = await fetchMyProgress();
        if (!alive) return;
        const pmap = {};
        for (const p of prog) {
          pmap[p.topic_id] = { status: p.status, updated_at: p.updated_at };
        }
        setProgressMap(pmap);

        // Load quiz questions + restore saved answers
        const questions = await fetchQuestionsForChapter(node.id);
        if (!alive) return;
        setQuizQuestions(questions || []);

        const savedAnswers = await fetchMyAnswers(node.id);
        if (!alive) return;
        if (savedAnswers && savedAnswers.length > 0) {
          const restoredAnswers = {};
          const restoredResults = {};
          for (const sa of savedAnswers) {
            restoredAnswers[sa.question_id] = sa.selected_option_ids || [];
            restoredResults[sa.question_id] = { question_id: sa.question_id, is_correct: sa.is_correct };
          }
          setQuizAnswers(restoredAnswers);
          setQuestionResults(restoredResults);
        }

        setLoading(false);
      } catch {
        if (!alive) return;
        setErr("Не удалось загрузить главу. Проверь backend и is_published=true.");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  // Filter lessons by left search
  const filteredLessons = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return lessons;
    return lessons.filter((l) => (l.title || "").toLowerCase().includes(qq));
  }, [lessons, q]);

  // Лабы главы — отдельный блок в сайдбаре, клик → /lab/:slug.
  const chapterLabs = useMemo(() => {
    if (!chapterNode) return [];
    const qq = q.trim().toLowerCase();
    const all = (chapterNode.children || [])
      .filter((c) => c.kind === "lab")
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
    if (!qq) return all;
    return all.filter((l) => (l.title || "").toLowerCase().includes(qq));
  }, [chapterNode, q]);

  // Find next chapter (theme — для breadcrumb; chapters игнорируем, используем allChapters ниже)
  const { theme } = useMemo(
    () => findThemeAndChapters(tree, chapterNode),
    [tree, chapterNode]
  );

  const allChapters = useMemo(() => buildAllChapters(tree), [tree]);

  const { prevChapter, nextChapter } = useMemo(() => {
    if (!chapterNode || !allChapters.length) return { prevChapter: null, nextChapter: null };
    const idx = allChapters.findIndex((c) => c.id === chapterNode.id);
    if (idx === -1) return { prevChapter: null, nextChapter: null };
    return {
      prevChapter: allChapters[idx - 1] || null,
      nextChapter: allChapters[idx + 1] || null,
    };
  }, [chapterNode, allChapters]);

  // Scroll to lesson
  const scrollToLesson = (lessonSlug) => {
    const el = lessonEls.current.get(lessonSlug);
    if (!el) return;
    scrollspyLocked.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Unlock after scroll settles
    clearTimeout(scrollToLesson._t);
    scrollToLesson._t = setTimeout(() => { scrollspyLocked.current = false; }, 800);
  };

  // Автонавигация из поиска: /chapter/<slug>?lesson=<slug>&match=<text>
  // - ?lesson=...  → активируем урок и скроллим к его началу
  // - ?match=...   → подсвечиваем все вхождения текста, скроллим к первому
  //                  (приоритетнее scroll'а на начало урока)
  // Оба параметра опциональны и независимы.
  useEffect(() => {
    if (loading) return;

    const params = new URLSearchParams(location.search);
    const lessonSlug = params.get("lesson");
    const matchText = params.get("match");

    if (!lessonSlug && !matchText) return;

    // Идемпотентность: одна и та же пара (lesson, match) не должна
    // триггерить эффект повторно (например при scrollspy-обновлении URL).
    const key = `${lessonSlug || ""}|${matchText || ""}`;
    if (lastAutoLessonRef.current === key) return;
    lastAutoLessonRef.current = key;

    // Снять предыдущие подсветки перед новыми
    if (searchHighlightsRef.current.length) {
      unwrapHighlights(searchHighlightsRef.current);
      searchHighlightsRef.current = [];
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // setTimeout — даём React завершить рендер, рефам установиться,
    // setQ("") уезжает в async-callback (вне sync-эффекта).
    const t = setTimeout(() => {
      setQ("");

      let scrollTarget = null;

      if (lessonSlug) {
        const el = lessonEls.current.get(lessonSlug);
        if (el) {
          setActiveLessonSlug(lessonSlug);
          scrollTarget = el;
        }
      }

      if (matchText) {
        // Если есть конкретный урок — ищем только в нём; иначе — во всей главе
        const root = lessonSlug
          ? lessonEls.current.get(lessonSlug)
          : document.querySelector(".chapter-content");
        if (root) {
          const hits = highlightInRoot(root, matchText);
          if (hits.length > 0) {
            searchHighlightsRef.current = hits;
            // Первый матч приоритетнее scroll'а к началу урока — он точнее
            scrollTarget = hits[0];
            // Авто-снятие подсветки через 4 секунды
            searchTimeoutRef.current = setTimeout(() => {
              unwrapHighlights(searchHighlightsRef.current);
              searchHighlightsRef.current = [];
              searchTimeoutRef.current = null;
            }, 4000);
          }
        }
      }

      if (scrollTarget) {
        // block: "center" чтобы матч оказался в середине viewport — заметнее.
        // Для урока-без-матча тоже center лучше — иначе заголовок прижат к шапке.
        scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);

    return () => clearTimeout(t);
  }, [location.search, loading]);

  // Cleanup подсветок при unmount компонента
  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (searchHighlightsRef.current.length) {
      unwrapHighlights(searchHighlightsRef.current);
      searchHighlightsRef.current = [];
    }
  }, []);

  // Scrollspy (active lesson)
  useEffect(() => {
    if (loading || !lessons.length) return;

    const els = lessons.map((l) => lessonEls.current.get(l.slug)).filter(Boolean);
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (scrollspyLocked.current) return;

        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));

        if (!visible.length) return;

        const s = visible[0].target.getAttribute("data-lesson-slug");
        if (!s) return;

        setActiveLessonSlug((prev) => (prev === s ? prev : s));
      },
      {
        root: null,
        rootMargin: "-18% 0px -70% 0px",
        threshold: [0.1, 0.2, 0.35, 0.5, 0.65],
      }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [lessons, loading]);

  // Progress auto-tracking via IntersectionObserver
  useEffect(() => {
    if (loading || !lessons.length || !user) return;

    const progressRef = { current: progressMap };
    progressRef.current = progressMap;

    // Observer for "in_progress": fires when lesson section enters viewport
    const startObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const slug = entry.target.getAttribute("data-lesson-slug");
          if (!slug) return;
          const lesson = lessons.find((l) => l.slug === slug);
          if (!lesson) return;

          const key = `${lesson.id}_in_progress`;
          if (trackedRef.current.has(key)) return;

          const current = progressRef.current[lesson.id]?.status;
          if (current === "in_progress" || current === "done") {
            trackedRef.current.add(key);
            return;
          }

          trackedRef.current.add(key);
          setProgressMap((prev) => ({
            ...prev,
            [lesson.id]: { status: "in_progress", updated_at: new Date().toISOString() },
          }));
          setProgress(lesson.id, "in_progress");
        });
      },
      { threshold: 0.3 }
    );

    // Observer for "done": fires when bottom sentinel enters viewport
    const doneObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const slug = entry.target.getAttribute("data-lesson-end");
          if (!slug) return;
          const lesson = lessons.find((l) => l.slug === slug);
          if (!lesson) return;

          const key = `${lesson.id}_done`;
          if (trackedRef.current.has(key)) return;

          const current = progressRef.current[lesson.id]?.status;
          if (current === "done") {
            trackedRef.current.add(key);
            return;
          }

          trackedRef.current.add(key);
          setProgressMap((prev) => ({
            ...prev,
            [lesson.id]: { status: "done", updated_at: new Date().toISOString() },
          }));
          setProgress(lesson.id, "done");
        });
      },
      { threshold: 0.9 }
    );

    lessons.forEach((l) => {
      const el = lessonEls.current.get(l.slug);
      if (el) startObs.observe(el);
      const endEl = lessonEndEls.current.get(l.slug);
      if (endEl) doneObs.observe(endEl);
    });

    return () => {
      startObs.disconnect();
      doneObs.disconnect();
    };
  }, [lessons, loading, user, progressMap]);

  // Progress-трекинг самой главы (её текст-введение).
  // Отдельный observer — не зависит от lessons.length, поэтому работает
  // и для глав без уроков (главная цель этой фичи). Механизм тот же,
  // что у уроков: секция в экране → in_progress, нижний sentinel
  // виден → done. UserProgress(chapterId) хранит «текст главы прочитан».
  useEffect(() => {
    if (loading || !user || !chapterNode) return;
    const chapterId = chapterNode.id;
    const progressRef = { current: progressMap };

    // threshold: 0 — срабатывает при ЛЮБОМ пересечении секции с экраном.
    // Для главы это правильно: «Chapter intro» — первая большая секция
    // сверху, она может быть в несколько экранов высотой. Порог по доле
    // площади (как 0.3 у уроков) для такой секции недостижим — пришлось
    // бы доскроллить почти до конца, и in_progress никогда бы не ставился.
    // Здесь же: открыл главу → секция на экране → in_progress.
    const startObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const key = `chapter_${chapterId}_in_progress`;
          if (trackedRef.current.has(key)) return;
          trackedRef.current.add(key);
          const current = progressRef.current[chapterId]?.status;
          if (current === "in_progress" || current === "done") return;
          setProgressMap((prev) => ({
            ...prev,
            [chapterId]: { status: "in_progress", updated_at: new Date().toISOString() },
          }));
          setProgress(chapterId, "in_progress");
        });
      },
      { threshold: 0 },
    );

    const doneObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const key = `chapter_${chapterId}_done`;
          if (trackedRef.current.has(key)) return;
          trackedRef.current.add(key);
          if (progressRef.current[chapterId]?.status === "done") return;
          setProgressMap((prev) => ({
            ...prev,
            [chapterId]: { status: "done", updated_at: new Date().toISOString() },
          }));
          setProgress(chapterId, "done");
        });
      },
      { threshold: 0.9 },
    );

    if (chapterIntroRef.current) startObs.observe(chapterIntroRef.current);
    if (chapterIntroEndRef.current) doneObs.observe(chapterIntroEndRef.current);

    return () => {
      startObs.disconnect();
      doneObs.disconnect();
    };
  }, [chapterNode, loading, user, progressMap]);

  // Плавное отслеживание доли прочитанного текста главы по скроллу —
  // чтобы прогресс-бар главы двигался по мере чтения, а не скачком.
  // RAF-throttle + порог 2% — ограничиваем число ре-рендеров LearnPage.
  useEffect(() => {
    if (loading || !chapterNode) return;
    let raf = null;
    const compute = () => {
      raf = null;
      const el = chapterIntroRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Доля секции, ушедшая выше нижней кромки экрана.
      const frac = rect.height > 0
        ? Math.max(0, Math.min(1, (vh - rect.top) / rect.height))
        : 1;
      setChapterReadFraction((prev) => {
        // Прогресс чтения МОНОТОННЫЙ — только вверх. Скролл назад не
        // откатывает: текст, который юзер уже видел, остаётся прочитанным.
        if (frac <= prev) return prev;
        // Обновляем при заметном росте или достижении конца — иначе
        // React делает bail-out, лишних ре-рендеров нет.
        if (frac >= 1 || frac - prev >= 0.02) return frac;
        return prev;
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loading, chapterNode]);

  // Keep active nav item visible in sidebar
  useEffect(() => {
    if (!activeLessonSlug) return;
    const btn = navRef.current?.querySelector(`[data-nav-slug="${activeLessonSlug}"]`);
    btn?.scrollIntoView({ block: "nearest" });
  }, [activeLessonSlug]);

  const handleCheckQuestion = async (questionId) => {
    if (questionSubmitting[questionId]) return;
    const ids = (quizAnswers[questionId] || []).map(Number);
    if (ids.length === 0) return;
    setQuestionSubmitting((p) => ({ ...p, [questionId]: true }));
    const result = await checkSingleQuestion(questionId, ids);
    setQuestionSubmitting((p) => ({ ...p, [questionId]: false }));
    if (result) {
      setQuestionResults((p) => ({ ...p, [questionId]: result }));
    }
  };

  const handleResetQuestion = (questionId) => {
    setQuestionResults((p) => {
      const next = { ...p };
      delete next[questionId];
      return next;
    });
    setQuizAnswers((p) => ({ ...p, [questionId]: [] }));
  };

  if (loading) {
    return (
      <>
        <SiteHeader
          user={user}
          onLoginClick={openLogin}
          onLogout={handleLogout}
        />
        <div className="page-with-fixed-header">
          <LearnPageSkeleton chapterNode={chapterNode || findNodeBySlug(getCachedTree() || [], slug)} />
        </div>
      </>
    );
  }

  if (err) {
    return (
      <>
        <SiteHeader
          user={user}
          onLoginClick={openLogin}
          onLogout={handleLogout}
        />
        <div className="page-with-fixed-header" style={{ padding: 24 }}>
          <div className="muted">{err}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn-outline" onClick={() => navigate("/")}>
              На главную
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader
        user={user}
        onLoginClick={openLogin}
        onLogout={handleLogout}
      />

      <div className="page-with-fixed-header">
        <div className={`chapter-layout${sidebarOpen ? " sidebar-open" : ""}`}>
          {/* Sidebar toggle (mobile only) */}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? "Скрыть навигацию" : "Показать навигацию"}
          >
            <span className="sidebar-toggle-arrow">{sidebarOpen ? "\u2039" : "\u203A"}</span>
          </button>

          {/* Overlay to close sidebar on tap */}
          {sidebarOpen && (
            <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
          )}

          {/* LEFT NAV */}
          <aside className="chapter-sidebar">
            <div className="chapter-sidebar-head">
              <div className="chapter-sidebar-title">{chapterNode?.title}</div>

              {theme ? (
                <div className="muted" style={{ marginBottom: 10 }}>
                  Тема: <b>{theme.title}</b>
                </div>
              ) : null}

              <input
                className="chapter-search"
                placeholder="Поиск по урокам…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              {/* Chapter progress bar.
                  Единицы прогресса: текст главы (1) + уроки + квизы.
                  pct — плавный: пока текст главы не дочитан, его вклад =
                  доля проскролленного (chapterReadFraction), что двигает
                  бар по мере чтения. detail — целые завершённые единицы.
                  Показывается всегда — для главы без уроков total=1. */}
              {user && (() => {
                const chapterId = chapterNode?.id;
                const chapterRead = chapterId && progressMap[chapterId]?.status === "done";
                const lessonsDone = lessons.filter((l) => progressMap[l.id]?.status === "done").length;
                const quizDone = quizQuestions.filter(
                  (qq) => questionResults[qq.id]?.is_correct,
                ).length;
                const total = 1 + lessons.length + quizQuestions.length;
                // Вклад текста главы: 1 если дочитан, иначе доля по скроллу.
                const chapterPart = chapterRead ? 1 : chapterReadFraction;
                const fullDone = (chapterRead ? 1 : 0) + lessonsDone + quizDone;
                const pct = Math.round(((chapterPart + lessonsDone + quizDone) / total) * 100);
                return (
                  <div className="sidebar-progress">
                    <div className="sidebar-progress-header">
                      <span className="sidebar-progress-label">Прогресс главы</span>
                      <span className="sidebar-progress-pct">{pct}%</span>
                    </div>
                    <div className="sidebar-progress-track">
                      <div className="sidebar-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="sidebar-progress-detail">{fullDone} из {total} пунктов</span>
                  </div>
                );
              })()}

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="btn-outline" to="/">
                  ← Содержание
                </Link>

                {nextChapter ? (
                  <Link className="btn-primary" to={`/chapter/${nextChapter.slug}`}>
                    Следующая глава →
                  </Link>
                ) : null}
              </div>
            </div>

            <nav className="chapter-nav" ref={navRef}>
              {filteredLessons.map((l, idx) => {
                const pStatus = progressMap[l.id]?.status;
                return (
                  <button
                    key={l.id}
                    type="button"
                    data-nav-slug={l.slug}
                    className={`chapter-nav-item ${activeLessonSlug === l.slug ? "active" : ""} ${
                      pStatus === "done" ? "is-done" : pStatus === "in_progress" ? "is-progress" : ""
                    }`}
                    onClick={() => {
                      setActiveLessonSlug(l.slug);
                      scrollToLesson(l.slug);
                      if (window.innerWidth <= 860) setSidebarOpen(false);
                    }}
                  >
                    <span className="chapter-nav-title">
                      {pStatus === "done" ? "\u2713 " : pStatus === "in_progress" ? "\u25CB " : ""}
                      {idx + 1}. {l.title}
                    </span>
                    <span className="chapter-nav-meta">
                      {l.estimated_minutes ? `${l.estimated_minutes} мин` : "Урок"}
                    </span>
                  </button>
                );
              })}

              {!filteredLessons.length && !chapterLabs.length && (
                <div className="muted" style={{ padding: 10 }}>
                  Ничего не найдено.
                </div>
              )}

              {/* Лабораторные, привязанные к главе. Рисуем отдельным блоком
                  после уроков — это не часть scroll-spy навигации, клик
                  уводит на /lab/:slug. */}
              {chapterLabs.length > 0 && (
                <div className="chapter-nav-labs">
                  <div className="chapter-nav-section-title">
                    <span style={{ color: "#10B981", display: "inline-flex" }}>
                      <FlaskMini/>
                    </span>
                    Практика
                  </div>
                  {chapterLabs.map((l) => {
                    const pStatus = progressMap[l.id]?.status;
                    return (
                      <Link
                        key={l.id}
                        to={`/lab/${l.slug}`}
                        className={`chapter-nav-item is-lab ${pStatus === "done" ? "is-done" : ""}`}
                        onClick={() => { if (window.innerWidth <= 860) setSidebarOpen(false); }}
                      >
                        <span className="chapter-nav-title">
                          {pStatus === "done" ? "✓ " : ""}
                          {l.title}
                        </span>
                        <span className="chapter-nav-meta">{labTypeShort(l.check_mode)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </nav>
          </aside>

          {/* Chapter navigation arrows */}
          {prevChapter && (
            <Link
              to={`/chapter/${prevChapter.slug}`}
              className="chapter-arrow chapter-arrow--prev"
              title={prevChapter.title}
              aria-label={`Предыдущая глава: ${prevChapter.title}`}
            >
              <svg className="chapter-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              <span className="chapter-arrow-label">{prevChapter.title}</span>
            </Link>
          )}
          {nextChapter && (
            <Link
              to={`/chapter/${nextChapter.slug}`}
              className="chapter-arrow chapter-arrow--next"
              title={nextChapter.title}
              aria-label={`Следующая глава: ${nextChapter.title}`}
            >
              <span className="chapter-arrow-label">{nextChapter.title}</span>
              <svg className="chapter-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </Link>
          )}

          {/* CONTENT */}
          <main className="chapter-content">
            <div className="chapter-content-inner">
              {/* Chapter intro */}
              <section className="lesson-section" ref={chapterIntroRef}>
                <div className="lesson-head">
                  <h2 className="lesson-h2">{chapterNode?.title}</h2>
                  <div className="lesson-actions">
                    {chapterNode && progressMap[chapterNode.id]?.status === "done" && (
                      <span className="lesson-badge lesson-badge--done" title="Прочитано">{"✓"}</span>
                    )}
                    {chapterNode && progressMap[chapterNode.id]?.status === "in_progress" && (
                      <span className="lesson-badge lesson-badge--progress" title="В процессе">{"●"}</span>
                    )}
                    <span className="lesson-min">Глава</span>
                  </div>
                </div>

                <div className="lesson-body">
                  <Markdown>{chapterContent || "_(пусто)_"}</Markdown>
                </div>

                {/* Нижний sentinel для отметки «текст главы прочитан» */}
                <div
                  ref={chapterIntroEndRef}
                  style={{ height: 1 }}
                  aria-hidden="true"
                />
              </section>

              {/* Lessons */}
              {lessons.map((l, idx) => {
                const pStatus = progressMap[l.id]?.status;
                return (
                  <section
                    key={l.id}
                    className="lesson-section"
                    data-lesson-slug={l.slug}
                    ref={(el) => el && lessonEls.current.set(l.slug, el)}
                  >
                    <div className="lesson-head">
                      <h2 className="lesson-h2">
                        {idx + 1}. {l.title}
                      </h2>
                      <div className="lesson-actions">
                        {pStatus === "done" && (
                          <span className="lesson-badge lesson-badge--done" title="Прочитано">{"\u2713"}</span>
                        )}
                        {pStatus === "in_progress" && (
                          <span className="lesson-badge lesson-badge--progress" title="В процессе">{"\u25CF"}</span>
                        )}
                        <span className="lesson-min">
                          {l.estimated_minutes ? `${l.estimated_minutes} мин` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="lesson-body">
                      <Markdown>{lessonContents[l.slug] || "_(пусто)_"}</Markdown>
                    </div>

                    {/* Bottom sentinel for "done" tracking */}
                    <div
                      data-lesson-end={l.slug}
                      ref={(el) => el && lessonEndEls.current.set(l.slug, el)}
                      style={{ height: 1 }}
                      aria-hidden="true"
                    />
                  </section>
                );
              })}

              {/* Quiz blocks: one section per question */}
              {quizQuestions.length > 0 && (
                <>
                  {quizQuestions.map((question, qi) => {
                    const resultItem = questionResults[question.id];
                    const isSubmitting = !!questionSubmitting[question.id];
                    const sel = quizAnswers[question.id] || [];
                    return (
                      <section
                        key={question.id}
                        className={`quiz-section quiz-question ${
                          resultItem
                            ? resultItem.is_correct
                              ? "quiz-question--correct"
                              : "quiz-question--wrong"
                            : ""
                        }`}
                      >
                        <div className="quiz-header">
                          <h2 className="quiz-title">Проверка знаний</h2>
                        </div>
                        <div className="quiz-question-text">
                          {qi + 1}. <MarkdownInline>{question.text}</MarkdownInline>
                        </div>

                        <div className="quiz-options">
                          {question.options.map((opt) => {
                            const isMulti = question.kind === "multiple";
                            const selected = sel.includes(opt.id);
                            let optClass = "";
                            if (resultItem && selected) {
                              optClass = resultItem.is_correct
                                ? "quiz-option--correct"
                                : "quiz-option--wrong";
                            }
                            return (
                              <label
                                key={opt.id}
                                className={`quiz-option ${selected ? "selected" : ""} ${optClass}`}
                              >
                                <input
                                  type={isMulti ? "checkbox" : "radio"}
                                  name={`q-${question.id}`}
                                  checked={selected}
                                  disabled={!!resultItem}
                                  onChange={() =>
                                    setQuizAnswers((prev) => {
                                      const cur = prev[question.id] || [];
                                      let next;
                                      if (isMulti) {
                                        next = cur.includes(opt.id)
                                          ? cur.filter((x) => x !== opt.id)
                                          : [...cur, opt.id];
                                      } else {
                                        next = [opt.id];
                                      }
                                      return { ...prev, [question.id]: next };
                                    })
                                  }
                                />
                                <MarkdownInline>{opt.text}</MarkdownInline>
                              </label>
                            );
                          })}
                        </div>

                        {resultItem && !resultItem.is_correct && resultItem.reference_slug && (
                          <button
                            className="btn-outline quiz-ref-btn"
                            onClick={() => {
                              navigate(
                                `/chapter/${resultItem.chapter_slug || slug}?lesson=${encodeURIComponent(resultItem.reference_slug)}`
                              );
                              setTimeout(() => {
                                const el = lessonEls.current.get(resultItem.reference_slug);
                                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                              }, 150);
                            }}
                          >
                            Вернуться к уроку: {resultItem.reference_title}
                          </button>
                        )}

                        <div className="quiz-actions">
                          {!resultItem ? (
                            <button
                              className="btn-primary"
                              onClick={() => handleCheckQuestion(question.id)}
                              disabled={isSubmitting || sel.length === 0}
                            >
                              {isSubmitting ? "Проверяем…" : "Проверить"}
                            </button>
                          ) : !resultItem.is_correct ? (
                            <button
                              className="btn-outline"
                              onClick={() => handleResetQuestion(question.id)}
                            >
                              Попробовать ещё раз
                            </button>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
                </>
              )}

              {/* Bottom next chapter */}
              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <Link className="btn-outline" to="/">
                  ← К содержанию
                </Link>
                {nextChapter ? (
                  <Link className="btn-primary" to={`/chapter/${nextChapter.slug}`}>
                    Следующая глава: {nextChapter.title} →
                  </Link>
                ) : (
                  <div className="muted">Это последняя глава в теме.</div>
                )}
              </div>
            </div>
          </main>
        </div>
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

/** Минимальная иконка-колба для блока «Практика» в сайдбаре главы.
 *  Не таскаем зависимость на admin/Icons — это публичная страница. */
function FlaskMini() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h6"/>
      <path d="M10 3v6.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.5V3"/>
      <line x1="7.5" y1="14" x2="16.5" y2="14"/>
    </svg>
  );
}