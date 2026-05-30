/**
 * useStructureManagement — хук-владелец structure-домена админки
 * (topics + questions + labs).
 *
 * Возвращает: { sidebar, editor, refresh } — JSX для двух слотов AdminPage shell.
 * Принимает: { setMsg, closeSidePanelIfMobile } из shell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconEmpty } from "./Icons";
import {
  fetchAllTopicsAdmin, createTopic, updateTopic, deleteTopic,
} from "../../api/content";
import {
  fetchAllAdminQuestions, createQuestion, updateQuestion, deleteQuestion,
  addOption, updateOption, deleteOption,
} from "../../api/quiz";
import {
  fetchLabAdmin, createLabOption, updateLabOption, deleteLabOption,
} from "../../api/labs";

import { slugify, buildTree } from "./helpers";
import { loadSessionState, saveSessionState } from "../../utils/sessionState";
import StructureSidebar from "./StructureSidebar";
import TopicEditor from "./TopicEditor";
import QuestionEditor from "./QuestionEditor";


const EMPTY_FORM = {
  id: null, type: "theme", title: "", slug: "", summary: "",
  parent_id: "", order: 0, estimated_minutes: "", is_published: true, content: "",
  // Lab-only поля
  colab_url: "",
  check_mode: "text_exact",
  expected_answer: "",
  numeric_tolerance: "",
  max_attempts: "",
  options: [],
  // python_code-only поля (только при check_mode === "python_code")
  starter_code: "",
  test_code: "",
  // В UI хранится строка "numpy, pandas" для удобства, на save парсится в array.
  required_packages_str: "",
  timeout_seconds: "",
};

const EMPTY_QUESTION_FORM = {
  id: null, text: "", kind: "single", chapter_id: "", order: 0,
  reference_topic_id: "", options: [],
};


// Персист навигационного состояния секции «Структура».
// AdminPage размонтируется при уходе на другую страницу учебника —
// сохраняем в sessionStorage выбранный объект, вкладку редактора и
// раскрытие дерева. form/черновик НЕ сохраняем: при возврате топик
// перечитывается с сервера (свежие данные). См. utils/sessionState.js.
const STRUCTURE_STATE_KEY = "admin_structure_state";


export function useStructureManagement({ setMsg, closeSidePanelIfMobile }) {
  // Восстановленное из sessionStorage состояние (один раз на маунте).
  const [persisted] = useState(() => loadSessionState(STRUCTURE_STATE_KEY));

  // ── Data ──
  const [topics, setTopics] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);

  // ── Selection / mode ── (восстанавливаются из сессии)
  const [selectedId, setSelectedId] = useState(persisted?.selectedId ?? null);
  const [selectedQuestionId, setSelectedQuestionId] = useState(persisted?.selectedQuestionId ?? null);
  // "topic" | "question". Дефолт "topic" — глобальный empty state.
  const [editMode, setEditMode] = useState(persisted?.editMode ?? "topic");
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);

  // ── Tree state ── (свёрнутые узлы восстанавливаются из сессии)
  const [collapsedIds, setCollapsedIds] = useState(
    () => new Set(persisted?.collapsedIds ?? []),
  );

  // ── Topic editor form ──
  const [form, setForm] = useState(EMPTY_FORM);
  const [originalLabOptions, setOriginalLabOptions] = useState([]);
  const [autoSlug, setAutoSlug] = useState(true);
  const [editorView, setEditorView] = useState(persisted?.editorView ?? "settings");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const mdRef = useRef(null);
  const formRef = useRef(null);

  // ── Question editor form ──
  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION_FORM);

  // ── Derived data ──
  const selected = useMemo(
    () => topics.find((t) => t.id === selectedId) || null,
    [topics, selectedId],
  );
  const selectedQuestion = useMemo(
    () => allQuestions.find((q) => q.id === selectedQuestionId) || null,
    [allQuestions, selectedQuestionId],
  );

  const themes = useMemo(
    () => topics.filter((t) => t.kind === "section" && (t.parent_id === null || t.parent_id === undefined)),
    [topics],
  );
  const subtopics = useMemo(() => topics.filter((t) => t.kind === "subtopic"), [topics]);
  const chapters = useMemo(
    () => topics.filter((t) => t.kind === "section" && t.parent_id !== null && t.parent_id !== undefined),
    [topics],
  );
  const lessonTopics = useMemo(() => topics.filter((t) => t.kind === "lesson"), [topics]);

  // Build tree with questions injected as virtual children of chapter nodes
  const tree = useMemo(() => {
    const base = buildTree(topics);
    const byChapter = {};
    for (const q of allQuestions) {
      if (!byChapter[q.chapter_id]) byChapter[q.chapter_id] = [];
      byChapter[q.chapter_id].push(q);
    }
    const inject = (nodes) => {
      for (const n of nodes) {
        if (n.kind === "section" && n.parent_id != null && byChapter[n.id]) {
          const qNodes = byChapter[n.id].map((q) => ({
            _isQuestion: true, _questionId: q.id,
            id: `q-${q.id}`, title: q.text, kind: "question",
            order: 9000 + (q.order || 0), children: [],
          }));
          n.children = [...n.children, ...qNodes];
        }
        if (n.children?.length) inject(n.children);
      }
    };
    inject(base);
    return base;
  }, [topics, allQuestions]);

  // ── Fetchers ──
  const fetchTopicsData = useCallback(async () => {
    setMsg("");
    const data = await fetchAllTopicsAdmin();
    setTopics(Array.isArray(data) ? data : []);
  }, [setMsg]);

  const loadAllQuestions = useCallback(async () => {
    const qs = await fetchAllAdminQuestions();
    setAllQuestions(qs || []);
  }, []);

  // Initial load
  const [didInit, setDidInit] = useState(false);
  useEffect(() => {
    if (didInit) return;
    setDidInit(true);
    fetchTopicsData();
    loadAllQuestions();
  }, [didInit, fetchTopicsData, loadAllQuestions]);

  // Свернуть дерево один раз при первой загрузке.
  const [treeInited, setTreeInited] = useState(false);
  useEffect(() => {
    if (treeInited || tree.length === 0) return;
    // Если состояние дерева восстановлено из сессии — НЕ пересворачиваем
    // (иначе перезатёрли бы сохранённое раскрытие узлов).
    if (!persisted) {
      const ids = new Set();
      const walk = (nodes) => {
        for (const n of nodes) {
          if (n.children?.length) { ids.add(n.id); walk(n.children); }
        }
      };
      walk(tree);
      setCollapsedIds(ids);
    }
    setTreeInited(true);
  }, [tree, treeInited, persisted]);

  // Персист навигационного состояния в sessionStorage при каждом
  // изменении. Операция дешёвая (маленький JSON) — debounce не нужен.
  useEffect(() => {
    saveSessionState(STRUCTURE_STATE_KEY, {
      selectedId,
      selectedQuestionId,
      editMode,
      editorView,
      collapsedIds: Array.from(collapsedIds),
    });
  }, [selectedId, selectedQuestionId, editMode, editorView, collapsedIds]);

  // ── Selection handlers ──
  const clearSelections = () => {
    setSelectedId(null);
    setSelectedQuestionId(null);
    setIsCreatingTopic(false);
  };

  const expandStructureAncestors = (topicId) => {
    const idsToOpen = [];
    let current = topics.find((t) => t.id === topicId);
    while (current && current.parent_id != null) {
      idsToOpen.push(current.parent_id);
      current = topics.find((t) => t.id === current.parent_id);
    }
    if (idsToOpen.length === 0) return;
    setCollapsedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      idsToOpen.forEach((id) => {
        if (next.has(id)) { next.delete(id); changed = true; }
      });
      return changed ? next : prev;
    });
  };

  const expandStructureForQuestion = (questionId) => {
    const q = allQuestions.find((x) => x.id === questionId);
    if (!q?.chapter_id) return;
    setCollapsedIds((prev) => {
      if (!prev.has(q.chapter_id)) return prev;
      const next = new Set(prev);
      next.delete(q.chapter_id);
      return next;
    });
    expandStructureAncestors(q.chapter_id);
  };

  const selectTopic = (id) => {
    clearSelections();
    setSelectedId(id);
    setEditMode("topic");
    expandStructureAncestors(id);
    closeSidePanelIfMobile?.();
  };

  const selectQuestion = (questionId) => {
    clearSelections();
    setSelectedQuestionId(questionId);
    setEditMode("question");
    expandStructureForQuestion(questionId);
    closeSidePanelIfMobile?.();
  };

  // ── Form reset ──
  const resetForm = (prefill = {}) => {
    clearSelections();
    setEditMode("topic");
    setForm({ ...EMPTY_FORM, ...prefill });
    setAutoSlug(true);
    setEditorView("settings");
    setDirty(false);
    setMsg("");
    if (Object.keys(prefill).length > 0) setIsCreatingTopic(true);
  };

  const resetQuestionForm = (prefill = {}) => {
    clearSelections();
    setEditMode("question");
    setQuestionForm({ ...EMPTY_QUESTION_FORM, ...prefill });
    setMsg("");
  };

  // selected → form
  useEffect(() => {
    if (editMode !== "topic" || !selected) return;
    let type = "chapter";
    if (selected.kind === "subtopic") type = "subtopic";
    else if (selected.kind === "lesson") type = "lesson";
    else if (selected.kind === "lab") type = "lab";
    else if (selected.kind === "section" && (selected.parent_id === null || selected.parent_id === undefined)) type = "theme";

    setForm({
      id: selected.id, type,
      title: selected.title || "", slug: selected.slug || "",
      summary: selected.summary || "",
      parent_id: selected.parent_id ?? "", order: selected.order ?? 0,
      estimated_minutes: selected.estimated_minutes ?? "",
      is_published: !!selected.is_published, content: selected.content || "",
      colab_url: selected.colab_url || "",
      check_mode: selected.check_mode || "text_exact",
      expected_answer: selected.expected_answer || "",
      numeric_tolerance: selected.numeric_tolerance ?? "",
      max_attempts: selected.max_attempts ?? "",
      options: [],
      // python_code: разворачиваем массив пакетов в строку для UI
      starter_code: selected.starter_code || "",
      test_code: selected.test_code || "",
      required_packages_str: Array.isArray(selected.required_packages)
        ? selected.required_packages.join(", ") : "",
      timeout_seconds: selected.timeout_seconds ?? "",
    });
    setAutoSlug(false);
    setEditorView("settings");
    setDirty(false);
    setMsg("");
    setOriginalLabOptions([]);
  }, [selected, editMode, setMsg]);

  // selected лаба → подтянуть опции
  useEffect(() => {
    if (editMode !== "topic") return;
    if (!selected || selected.kind !== "lab") return;
    let alive = true;
    (async () => {
      const data = await fetchLabAdmin(selected.id);
      if (!alive || !data) return;
      const opts = (data.options || []).map((o) => ({
        id: o.id, text: o.text, is_correct: !!o.is_correct, order: o.order ?? 0,
      }));
      setForm((prev) => ({ ...prev, options: opts }));
      setOriginalLabOptions(opts);
    })();
    return () => { alive = false; };
  }, [selected, editMode]);

  // Question selection -> editor mapping
  useEffect(() => {
    if (editMode !== "question" || !selectedQuestion) return;
    setQuestionForm({
      id: selectedQuestion.id,
      text: selectedQuestion.text || "",
      kind: selectedQuestion.kind || "single",
      chapter_id: selectedQuestion.chapter_id ? String(selectedQuestion.chapter_id) : "",
      order: selectedQuestion.order ?? 0,
      reference_topic_id: selectedQuestion.reference_topic_id ? String(selectedQuestion.reference_topic_id) : "",
      options: (selectedQuestion.options || []).map((o) => ({ ...o })),
    });
    setMsg("");
  }, [selectedQuestion, editMode, setMsg]);

  // ── Field handlers ──
  const setField = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setDirty(true); };
  const setQField = (k, v) => setQuestionForm((p) => ({ ...p, [k]: v }));

  const onTitle = (v) => {
    setField("title", v);
    if (autoSlug) setField("slug", slugify(v));
  };

  // ── Lab options helpers ──
  const addLabOption = () => {
    setForm((p) => ({
      ...p,
      options: [...p.options, { id: null, text: "", is_correct: false, order: p.options.length }],
    }));
    setDirty(true);
  };
  const updateLabOptionField = (idx, key, value) => {
    setForm((p) => {
      const next = p.options.slice();
      next[idx] = { ...next[idx], [key]: value };
      return { ...p, options: next };
    });
    setDirty(true);
  };
  const removeLabOption = (idx) => {
    setForm((p) => ({
      ...p,
      options: p.options.filter((_, i) => i !== idx).map((o, i) => ({ ...o, order: i })),
    }));
    setDirty(true);
  };

  // ── Quick create ──
  const createTheme = () => resetForm({ type: "theme", content: "" });
  const createSubtopic = () => {
    const parentThemeId =
      selected?.kind === "section" && (selected.parent_id === null || selected.parent_id === undefined)
        ? selected.id : "";
    resetForm({ type: "subtopic", parent_id: parentThemeId ? String(parentThemeId) : "", content: "" });
  };
  const createChapter = () => {
    let parentId = "";
    if (selected?.kind === "section") parentId = String(selected.id);
    resetForm({ type: "chapter", parent_id: parentId, content: "# Глава\n\nТекст главы…" });
  };
  const createLesson = () => {
    const parentChapterId =
      selected?.kind === "section" && selected.parent_id !== null && selected.parent_id !== undefined
        ? selected.id : "";
    resetForm({
      type: "lesson",
      parent_id: parentChapterId ? String(parentChapterId) : "",
      content: "# Урок\n\nТекст урока…",
      estimated_minutes: 10,
    });
  };
  const createLab = () => {
    let parentId = "";
    if (selected?.kind === "section") parentId = String(selected.id);
    else if (selected?.kind === "subtopic") parentId = String(selected.id);
    resetForm({
      type: "lab",
      parent_id: parentId,
      content: "## Условие\n\nОписание задания. Перейди по ссылке на Colab, выполни код, ответь на вопрос ниже.",
      colab_url: "",
      check_mode: "text_exact",
      expected_answer: "",
      numeric_tolerance: "",
      max_attempts: "",
      options: [],
    });
  };
  const createQuestionForm = () => {
    let chapterId = "";
    if (selected?.kind === "section" && selected.parent_id != null) chapterId = String(selected.id);
    resetQuestionForm({ chapter_id: chapterId });
  };

  const parentOptions = useMemo(() => {
    if (form.type === "subtopic") return themes;
    if (form.type === "chapter") return [...themes, ...subtopics];
    if (form.type === "lesson") return chapters;
    if (form.type === "lab") return [...themes, ...subtopics, ...chapters];
    return [];
  }, [form.type, themes, subtopics, chapters]);

  // ── Save / Delete topic ──
  const syncLabOptions = async (labId, original, current) => {
    const currentIds = new Set(current.filter((o) => o.id != null).map((o) => o.id));
    for (const o of original) {
      if (o.id != null && !currentIds.has(o.id)) {
        await deleteLabOption(labId, o.id);
      }
    }
    for (let i = 0; i < current.length; i++) {
      const o = current[i];
      const body = {
        text: (o.text || "").trim(),
        is_correct: !!o.is_correct,
        order: o.order ?? i,
      };
      if (o.id == null) await createLabOption(labId, body);
      else await updateLabOption(labId, o.id, body);
    }
  };

  const save = async (e) => {
    if (e) e.preventDefault();
    setMsg("");
    if (!form.slug.trim()) { setMsg("slug обязателен", "error"); setEditorView("settings"); return; }

    let kind = "section";
    if (form.type === "lesson") kind = "lesson";
    else if (form.type === "subtopic") kind = "subtopic";
    else if (form.type === "lab") kind = "lab";

    let parent_id = null;
    if (form.type === "subtopic" || form.type === "chapter" || form.type === "lesson" || form.type === "lab") {
      if (!form.parent_id) {
        const labels = { subtopic: "тему", chapter: "родителя", lesson: "главу", lab: "родителя (тема/подтема/глава)" };
        setMsg(`Выбери ${labels[form.type]}`, "error");
        setEditorView("settings");
        return;
      }
      parent_id = Number(form.parent_id);
    }

    const isLab = form.type === "lab";
    if (isLab) {
      if (!form.check_mode) { setMsg("Выберите режим проверки", "error"); setEditorView("settings"); return; }
      // colab_url нужен для всех режимов кроме python_code (там задание в браузере)
      if (form.check_mode !== "python_code" && !form.colab_url.trim()) {
        setMsg("Укажите ссылку на Google Colab", "error"); setEditorView("settings"); return;
      }
      if (form.check_mode === "text_exact" && !form.expected_answer.trim()) {
        setMsg("Укажите ожидаемый текстовый ответ", "error"); setEditorView("settings"); return;
      }
      if (form.check_mode === "numeric") {
        if (form.expected_answer === "" || isNaN(Number(form.expected_answer))) {
          setMsg("Укажите ожидаемое число", "error"); setEditorView("settings"); return;
        }
      }
      if (form.check_mode === "single_choice" || form.check_mode === "multiple_choice") {
        if (!form.options || form.options.length < 2) {
          setMsg("Должно быть минимум 2 варианта ответа", "error"); setEditorView("settings"); return;
        }
        if (form.options.some((o) => !(o.text || "").trim())) {
          setMsg("Текст варианта не может быть пустым", "error"); setEditorView("settings"); return;
        }
        const correctCount = form.options.filter((o) => o.is_correct).length;
        if (form.check_mode === "single_choice" && correctCount !== 1) {
          setMsg("Для одиночного выбора отметьте ровно один правильный вариант", "error"); setEditorView("settings"); return;
        }
        if (form.check_mode === "multiple_choice" && correctCount < 1) {
          setMsg("Отметьте хотя бы один правильный вариант", "error"); setEditorView("settings"); return;
        }
      }
      if (form.check_mode === "python_code") {
        // test_code обязателен — без него нечем проверять.
        if (!form.test_code || !form.test_code.trim()) {
          setMsg("Укажите код тестов (assert-блоки)", "error"); setEditorView("settings"); return;
        }
        if (form.timeout_seconds !== "" && (isNaN(Number(form.timeout_seconds)) || Number(form.timeout_seconds) <= 0)) {
          setMsg("Таймаут должен быть положительным числом или пустым (по умолчанию 5 сек)", "error"); setEditorView("settings"); return;
        }
      }
    }

    // python_code: парсим "numpy, pandas, scipy" → ["numpy", "pandas", "scipy"]
    const isPyLab = isLab && form.check_mode === "python_code";
    const requiredPackagesArr = isPyLab
      ? (form.required_packages_str || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    const payload = {
      slug: form.slug.trim(), title: form.title.trim(),
      content: (form.type === "theme" || form.type === "subtopic") ? "" : (form.content || ""),
      summary: form.summary || null, kind, parent_id,
      order: Number(form.order || 0),
      estimated_minutes: form.type === "lesson" ? (form.estimated_minutes === "" ? null : Number(form.estimated_minutes)) : null,
      is_published: !!form.is_published,
      // colab_url: для python_code пустая строка → null (Colab не нужен)
      colab_url: isLab && form.check_mode !== "python_code"
        ? form.colab_url.trim() : null,
      check_mode: isLab ? form.check_mode : null,
      expected_answer: isLab && (form.check_mode === "text_exact" || form.check_mode === "numeric")
        ? String(form.expected_answer).trim() : null,
      numeric_tolerance: isLab && form.check_mode === "numeric"
        ? (form.numeric_tolerance === "" ? 0 : Number(form.numeric_tolerance)) : null,
      max_attempts: isLab && form.max_attempts !== "" ? Number(form.max_attempts) : null,
      // python_code-only поля
      starter_code: isPyLab ? (form.starter_code || "") : null,
      test_code: isPyLab ? (form.test_code || "") : null,
      required_packages: isPyLab ? requiredPackagesArr : null,
      timeout_seconds: isPyLab && form.timeout_seconds !== ""
        ? Number(form.timeout_seconds) : null,
    };

    const isUpdate = !!form.id;
    setSaving(true);
    try {
      const result = isUpdate ? await updateTopic(form.id, payload) : await createTopic(payload);
      if (!result.ok) { setMsg(result.error, "error"); return; }

      if (isLab) {
        const labId = result.data.id;
        const isChoice = form.check_mode === "single_choice" || form.check_mode === "multiple_choice";
        if (isChoice) {
          await syncLabOptions(labId, isUpdate ? originalLabOptions : [], form.options);
        } else if (isUpdate && originalLabOptions.length > 0) {
          for (const o of originalLabOptions) {
            if (o.id != null) await deleteLabOption(labId, o.id);
          }
        }
      }

      setMsg(isUpdate ? "Сохранено" : "Создано");
      setDirty(false);
      await fetchTopicsData();
      selectTopic(result.data.id);
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!form.id) return;
    if (!window.confirm("Удалить элемент?")) return;
    const result = await deleteTopic(form.id);
    if (result.ok) {
      setMsg("Удалено");
      await fetchTopicsData();
      resetForm();
    } else {
      setMsg(result.error, "error");
    }
  };

  // ── Save / Delete question ──
  const saveQuestion = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!questionForm.text.trim()) { setMsg("Текст вопроса обязателен", "error"); return; }
    if (!questionForm.chapter_id) { setMsg("Выбери главу", "error"); return; }
    if (!questionForm.options || questionForm.options.length < 2) { setMsg("Должно быть минимум 2 варианта ответа", "error"); return; }
    if (questionForm.options.some((o) => !(o.text || "").trim())) { setMsg("Текст варианта не может быть пустым", "error"); return; }
    const correctCount = questionForm.options.filter((o) => o.is_correct).length;
    if (questionForm.kind === "single" && correctCount !== 1) { setMsg("Для одиночного выбора отметь ровно один правильный вариант", "error"); return; }
    if (questionForm.kind === "multiple" && correctCount < 1) { setMsg("Отметь хотя бы один правильный вариант", "error"); return; }

    if (questionForm.id) {
      await updateQuestion(questionForm.id, {
        text: questionForm.text.trim(), kind: questionForm.kind,
        order: Number(questionForm.order || 0),
        reference_topic_id: questionForm.reference_topic_id ? Number(questionForm.reference_topic_id) : null,
      });
      for (const opt of questionForm.options) {
        if (opt.id) await updateOption(opt.id, { text: opt.text, is_correct: opt.is_correct, order: opt.order || 0 });
      }
      setMsg("Вопрос сохранён");
      await loadAllQuestions();
    } else {
      const result = await createQuestion(Number(questionForm.chapter_id), {
        text: questionForm.text.trim(), kind: questionForm.kind,
        order: Number(questionForm.order || 0),
        reference_topic_id: questionForm.reference_topic_id ? Number(questionForm.reference_topic_id) : null,
        options: questionForm.options.map((o) => ({ text: o.text, is_correct: o.is_correct, order: o.order || 0 })),
      });
      if (result) {
        setMsg("Вопрос создан");
        await loadAllQuestions();
        selectQuestion(result.id);
      } else {
        setMsg("Ошибка создания вопроса", "error");
      }
    }
  };

  const delQuestion = async () => {
    if (!questionForm.id) return;
    if (!window.confirm("Удалить вопрос?")) return;
    await deleteQuestion(questionForm.id);
    setMsg("Вопрос удалён");
    await loadAllQuestions();
    resetForm();
  };

  // ── Question option helpers ──
  const addLocalOption = () => {
    setQuestionForm((prev) => ({
      ...prev,
      options: [...prev.options, { id: null, text: "", is_correct: false, order: prev.options.length }],
    }));
  };

  const updateLocalOption = (idx, field, value) => {
    setQuestionForm((prev) => {
      const opts = prev.options.map((o) => ({ ...o }));
      opts[idx] = { ...opts[idx], [field]: value };
      if (field === "is_correct" && value && prev.kind === "single") {
        opts.forEach((o, i) => { if (i !== idx) o.is_correct = false; });
      }
      return { ...prev, options: opts };
    });
  };

  const toggleQuestionKind = (multi) => {
    setQuestionForm((prev) => {
      const newKind = multi ? "multiple" : "single";
      let opts = prev.options.map((o) => ({ ...o }));
      if (newKind === "single") {
        let kept = false;
        opts = opts.map((o) => {
          if (o.is_correct && !kept) { kept = true; return o; }
          return { ...o, is_correct: false };
        });
      }
      return { ...prev, kind: newKind, options: opts };
    });
  };

  const removeLocalOption = async (idx) => {
    const opt = questionForm.options[idx];
    if (opt.id) { await deleteOption(opt.id); await loadAllQuestions(); }
    setQuestionForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== idx) }));
  };

  const addOptionToExisting = async () => {
    if (!questionForm.id) { addLocalOption(); return; }
    const result = await addOption(questionForm.id, { text: "Вариант", is_correct: false, order: questionForm.options.length });
    if (result) {
      const qs = await fetchAllAdminQuestions();
      setAllQuestions(qs || []);
    }
  };

  // ── Tree collapse helpers ──
  const collectDescendantIds = (parentId) => {
    const result = [];
    const stack = [parentId];
    while (stack.length) {
      const pid = stack.pop();
      for (const t of topics) {
        if (t.parent_id === pid) { result.push(t.id); stack.push(t.id); }
      }
    }
    return result;
  };

  const toggleCollapse = (id, e) => {
    e.stopPropagation();
    const isCurrentlyCollapsed = collapsedIds.has(id);
    if (isCurrentlyCollapsed) {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      const descendants = collectDescendantIds(id);
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        descendants.forEach((d) => next.add(d));
        return next;
      });
    }
  };

  // ── JSX слоты ──

  const sidebar = (
    <StructureSidebar
      tree={tree}
      editMode={editMode}
      selectedId={selectedId}
      selectedQuestionId={selectedQuestionId}
      collapsedIds={collapsedIds}
      toggleCollapse={toggleCollapse}
      selectTopic={selectTopic}
      selectQuestion={selectQuestion}
      createTheme={createTheme}
      createSubtopic={createSubtopic}
      createChapter={createChapter}
      createLesson={createLesson}
      createLab={createLab}
      createQuestionForm={createQuestionForm}
      onRefresh={() => { fetchTopicsData(); loadAllQuestions(); }}
    />
  );

  const editor = (
    <>
      {editMode === "topic" && (selectedId || isCreatingTopic) && (
        <TopicEditor
          form={form}
          setField={setField}
          onTitle={onTitle}
          editorView={editorView}
          setEditorView={setEditorView}
          autoSlug={autoSlug}
          setAutoSlug={setAutoSlug}
          parentOptions={parentOptions}
          dirty={dirty}
          saving={saving}
          mdRef={mdRef}
          formRef={formRef}
          onSave={save}
          onDelete={del}
          onClear={resetForm}
          allTopics={topics}
          allQuestions={allQuestions}
          onSelectTopic={selectTopic}
          onSelectQuestion={selectQuestion}
          addLabOption={addLabOption}
          updateLabOptionField={updateLabOptionField}
          removeLabOption={removeLabOption}
        />
      )}

      {editMode === "question" && (
        <QuestionEditor
          form={questionForm}
          setQField={setQField}
          chapters={chapters}
          lessonTopics={lessonTopics}
          toggleKind={toggleQuestionKind}
          onAddOption={questionForm.id ? addOptionToExisting : addLocalOption}
          onUpdateOption={updateLocalOption}
          onRemoveOption={removeLocalOption}
          onSave={saveQuestion}
          onDelete={delQuestion}
          onClear={resetForm}
        />
      )}

      {editMode === "topic" && !selectedId && !isCreatingTopic && (
        <div className="ap-empty-state">
          <IconEmpty/>
          <p>Выберите элемент для редактирования или создайте новый</p>
        </div>
      )}
    </>
  );

  return {
    sidebar,
    editor,
    refresh: useCallback(() => {
      fetchTopicsData();
      loadAllQuestions();
    }, [fetchTopicsData, loadAllQuestions]),
  };
}
