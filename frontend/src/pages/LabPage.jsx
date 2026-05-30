/**
 * /lab/:slug — страница практического задания (Topic kind="lab").
 *
 * UI: инструкция (Markdown+LaTeX) → кнопка Colab → форма ответа
 * (input/radio/checkbox по check_mode) → история попыток.
 * Прогресс закрывается автоматически — бэк апсёртит UserProgress
 * при первом is_correct=true.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import SiteHeader from "../components/SiteHeader";
import AuthModal from "../components/AuthModal";
import Markdown from "../components/Markdown";
import PythonExerciseForm from "../components/PythonExerciseForm";
import { useAuth } from "../contexts/useAuth";
import { fetchTree } from "../api/content";
import { fetchLabPublic, submitLabAnswer, fetchMyLabSubmissions } from "../api/labs";
import { labTypeLabel } from "../utils/labType";
import { IconFlask } from "./admin/Icons";


function findNodeById(nodes, id) {
  for (const n of nodes || []) {
    if (n.id === id) return n;
    const inner = findNodeById(n.children, id);
    if (inner) return inner;
  }
  return null;
}

function findNodeBySlug(nodes, slug) {
  for (const n of nodes || []) {
    if (n.slug === slug) return n;
    const inner = findNodeBySlug(n.children, slug);
    if (inner) return inner;
  }
  return null;
}


export default function LabPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, logout, loginSuccess } = useAuth();

  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [lab, setLab] = useState(null);          // LabPublic
  const [tree, setTree] = useState([]);           // для breadcrumb
  const [submissions, setSubmissions] = useState([]); // история (только для авторизованных)

  // Локальный state ответа
  const [textValue, setTextValue] = useState("");
  const [singleId, setSingleId] = useState(null);
  const [multiIds, setMultiIds] = useState(new Set());

  // Состояние проверки
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { is_correct, attempts_used, attempts_left, detail? }

  const openLogin = () => setShowAuth(true);
  const handleLogout = () => { logout(); navigate("/"); };

  const reloadSubmissions = useCallback(async (labId) => {
    if (!user) return;
    const items = await fetchMyLabSubmissions(labId);
    setSubmissions(items || []);
  }, [user]);

  // Лаба + дерево (для breadcrumb)
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      setLoading(true);
      setErr("");
      setLab(null);
      setLastResult(null);

      try {
        const treeData = await fetchTree();
        if (!alive) return;
        setTree(Array.isArray(treeData) ? treeData : []);

        const node = findNodeBySlug(treeData, slug);
        if (!node || node.kind !== "lab") {
          setErr("Лабораторная не найдена (или не опубликована).");
          setLoading(false);
          return;
        }
        const labData = await fetchLabPublic(node.id);
        if (!alive) return;
        if (!labData) {
          setErr("Не удалось загрузить лабу.");
          setLoading(false);
          return;
        }
        setLab(labData);

        if (user) {
          const subs = await fetchMyLabSubmissions(labData.id);
          if (!alive) return;
          setSubmissions(subs || []);
        }
      } catch {
        if (alive) setErr("Не удалось загрузить лабу.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [slug, user]);

  // Breadcrumb: theme/subtopic/chapter → lab
  const breadcrumb = useMemo(() => {
    if (!lab || !tree.length) return [];
    const chain = [];
    let cur = findNodeById(tree, lab.id);
    while (cur && cur.parent_id != null) {
      const parent = findNodeById(tree, cur.parent_id);
      if (!parent) break;
      chain.unshift(parent);
      cur = parent;
    }
    return chain;
  }, [lab, tree]);

  const attemptsTotal = lab?.max_attempts ?? null;
  const attemptsUsed = submissions.length;
  const attemptsLeft = attemptsTotal != null ? Math.max(0, attemptsTotal - attemptsUsed) : null;
  const alreadyPassed = submissions.some((s) => s.is_correct);
  const limitReached = attemptsLeft === 0 && !alreadyPassed;

  // ─── Submit ───
  const buildAnswerString = () => {
    if (!lab?.check_mode) return "";
    if (lab.check_mode === "text_exact" || lab.check_mode === "numeric") {
      return textValue;
    }
    if (lab.check_mode === "single_choice") {
      return JSON.stringify(singleId == null ? [] : [singleId]);
    }
    if (lab.check_mode === "multiple_choice") {
      return JSON.stringify([...multiIds].sort((a, b) => a - b));
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!user) { setShowAuth(true); return; }
    if (!lab) return;
    setSubmitting(true);
    setLastResult(null);
    try {
      const result = await submitLabAnswer(lab.id, buildAnswerString());
      setLastResult(result);
      await reloadSubmissions(lab.id);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── RENDER ───

  if (loading) {
    return (
      <>
        <SiteHeader user={user} onLoginClick={openLogin} onLogout={handleLogout}/>
        <div className="page-with-fixed-header">
          <div className="container" style={{ padding: "32px 16px" }}>
            <div className="lj-muted">Загрузка лабы...</div>
          </div>
        </div>
      </>
    );
  }

  if (err) {
    return (
      <>
        <SiteHeader user={user} onLoginClick={openLogin} onLogout={handleLogout}/>
        <div className="page-with-fixed-header">
          <div className="container" style={{ padding: "32px 16px" }}>
            <div className="lj-muted">{err}</div>
            <Link to="/" className="btn-outline" style={{ marginTop: 16, display: "inline-block" }}>
              На главную
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader user={user} onLoginClick={openLogin} onLogout={handleLogout}/>

      <div className="page-with-fixed-header">
        <div
          className="container"
          style={{
            padding: "24px 16px",
            // python_code: расширяем под двухколоночный split (условие | редактор).
            // На узких экранах CSS-media query всё равно сожмёт в одну колонку.
            maxWidth: lab.check_mode === "python_code" ? 1400 : 820,
          }}
        >

          {/* Breadcrumb */}
          {breadcrumb.length > 0 && (
            <nav className="lab-breadcrumb">
              <Link to="/">Содержание</Link>
              {breadcrumb.map((p) => (
                <span key={p.id}>
                  <span className="lab-breadcrumb-sep">/</span>
                  {p.kind === "section" && p.parent_id != null ? (
                    <Link to={`/chapter/${p.slug}`}>{p.title}</Link>
                  ) : (
                    <span>{p.title}</span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {/* Header */}
          <header className="lab-header">
            <div className="lab-header-icon" aria-hidden="true">
              <IconFlask size={26}/>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="lab-kicker">{labTypeLabel(lab.check_mode)}</div>
              <h1 className="lab-title">{lab.title}</h1>
              {lab.summary && <p className="lab-summary">{lab.summary}</p>}
            </div>
          </header>

          {lab.check_mode === "python_code" ? (
            /* ─── PYTHON_CODE: split layout (условие | редактор) ─────
               Слева — Markdown-описание + история попыток (длинная скроллится
               вместе со страницей). Справа — sticky панель с формой и
               результатом (остаётся в поле зрения при скролле условия).
               На <=1024px CSS складывает в одну колонку, sticky отключается. */
            <div className="lab-py-split">
              <div className="lab-py-split-left">
                {lab.content?.trim() ? (
                  <div className="lesson-body lab-content">
                    <Markdown>{lab.content}</Markdown>
                  </div>
                ) : (
                  <div className="lj-muted" style={{ fontStyle: "italic" }}>
                    Преподаватель ещё не добавил описание задачи.
                  </div>
                )}

                {user && submissions.length > 0 && (
                  <details className="lab-history">
                    <summary>История попыток ({submissions.length})</summary>
                    <ul>
                      {submissions.map((s) => (
                        <li key={s.id} className={s.is_correct ? "is-ok" : "is-bad"}>
                          <span className="lab-history-marker">{s.is_correct ? "✓" : "✕"}</span>
                          <span className="lab-history-time">
                            {new Date(s.submitted_at).toLocaleString("ru-RU")}
                          </span>
                          <pre className="lab-history-answer lab-history-answer--code">
                            {s.submitted_answer || "(пусто)"}
                          </pre>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              <div className="lab-py-split-right">
                <h2 className="lab-section-title" style={{ marginTop: 0 }}>Решение</h2>

                {!user && (
                  <div className="lj-cta-block lj-cta-block--warm" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>Войдите, чтобы отправить ответ и засчитать прогресс.</span>
                    <button className="btn-primary" onClick={openLogin} style={{ marginLeft: 12 }}>Войти</button>
                  </div>
                )}
                {user && alreadyPassed && (
                  <div className="lab-status lab-status--ok">
                    ✓ Вы уже сдали эту лабу. Можно повторить попытку для тренировки —
                    прогресс не пропадёт.
                  </div>
                )}
                {user && limitReached && !alreadyPassed && (
                  <div className="lab-status lab-status--bad">
                    ✕ Лимит попыток исчерпан ({attemptsTotal}). Лаба не зачтена.
                  </div>
                )}

                <PythonExerciseForm
                  // key — см. комментарий ниже про reset state при смене user/lab
                  key={`${user?.id || "guest"}_${lab.id}`}
                  lab={lab}
                  user={user}
                  disabled={!user || (limitReached && !alreadyPassed)}
                  submitting={submitting}
                  onSubmit={async (userCode, isCorrect) => {
                    if (!user) { setShowAuth(true); return; }
                    setSubmitting(true);
                    setLastResult(null);
                    try {
                      const result = await submitLabAnswer(
                        lab.id, userCode,
                        { clientVerifiedCorrect: isCorrect },
                      );
                      setLastResult(result);
                      await reloadSubmissions(lab.id);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                />

                {lastResult && (
                  <div className={`lab-py-verdict lab-py-verdict--${lastResult.is_correct ? "ok" : "bad"}`}>
                    <span className="lab-py-verdict-icon" aria-hidden="true">
                      {lastResult.is_correct ? "✓" : "✕"}
                    </span>
                    <div>
                      <div className="lab-py-verdict-title">
                        {lastResult.is_correct ? "Решено!" : "Не решено"}
                      </div>
                      <div className="lab-py-verdict-detail">
                        {lastResult.detail
                          ? lastResult.detail
                          : lastResult.is_correct
                            ? "Прогресс сохранён, попытка засчитана."
                            : "Не все тесты прошли — открой вкладку «Вывод» чтобы посмотреть детали."}
                      </div>
                    </div>
                  </div>
                )}

                {attemptsTotal != null && (
                  <div className="lab-attempts" style={{ flexShrink: 0 }}>
                    Попыток: {attemptsUsed}/{attemptsTotal}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ─── COLAB-БАЗИРОВАННЫЕ режимы (text/numeric/choice) ─────
               Один столбец как раньше: Colab-кнопка → описание → форма → история. */
            <>
              {/* Open in Colab */}
              {lab.colab_url ? (
                <a
                  href={lab.colab_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary lab-colab-btn"
                >
                  Открыть в Google Colab ↗
                </a>
              ) : (
                <div className="lj-muted" style={{ marginBottom: 16 }}>
                  Преподаватель ещё не указал ссылку на Colab.
                </div>
              )}

              {/* Описание / инструкция */}
              {lab.content?.trim() && (
                <div className="lesson-body lab-content">
                  <Markdown>{lab.content}</Markdown>
                </div>
              )}

              {/* Форма ответа */}
              <section className="lab-answer-section">
                <h2 className="lab-section-title">Ответ</h2>

                {!user && (
                  <div className="lj-cta-block lj-cta-block--warm" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>Войдите, чтобы отправить ответ и засчитать прогресс.</span>
                    <button className="btn-primary" onClick={openLogin} style={{ marginLeft: 12 }}>Войти</button>
                  </div>
                )}

                {user && alreadyPassed && (
                  <div className="lab-status lab-status--ok">
                    ✓ Вы уже сдали эту лабу. Можно повторить попытку для тренировки —
                    прогресс не пропадёт.
                  </div>
                )}

                {user && limitReached && !alreadyPassed && (
                  <div className="lab-status lab-status--bad">
                    ✕ Лимит попыток исчерпан ({attemptsTotal}). Лаба не зачтена.
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <LabAnswerInput
                    lab={lab}
                    disabled={!user || submitting || (limitReached && !alreadyPassed)}
                    textValue={textValue}
                    setTextValue={setTextValue}
                    singleId={singleId}
                    setSingleId={setSingleId}
                    multiIds={multiIds}
                    setMultiIds={setMultiIds}
                  />

                  <div className="lab-form-foot">
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={!user || submitting || (limitReached && !alreadyPassed)}
                    >
                      {submitting ? "Проверяем…" : "Проверить"}
                    </button>
                    {attemptsTotal != null && (
                      <span className="lab-attempts">
                        Попыток: {attemptsUsed}/{attemptsTotal}
                      </span>
                    )}
                  </div>
                </form>

                {lastResult && (
                  <div className={`lab-result ${lastResult.is_correct ? "is-ok" : "is-bad"}`}>
                    {lastResult.detail
                      ? lastResult.detail
                      : lastResult.is_correct
                        ? "✓ Верно!"
                        : "✕ Неверно. Попробуйте ещё раз."}
                  </div>
                )}
              </section>

              {/* История */}
              {user && submissions.length > 0 && (
                <details className="lab-history">
                  <summary>История попыток ({submissions.length})</summary>
                  <ul>
                    {submissions.map((s) => (
                      <li key={s.id} className={s.is_correct ? "is-ok" : "is-bad"}>
                        <span className="lab-history-marker">{s.is_correct ? "✓" : "✕"}</span>
                        <span className="lab-history-time">
                          {new Date(s.submitted_at).toLocaleString("ru-RU")}
                        </span>
                        <code className="lab-history-answer">{s.submitted_answer || "(пусто)"}</code>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

        </div>
      </div>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onAuthSuccess={loginSuccess}/>
      )}
    </>
  );
}


/** Поле ответа в зависимости от check_mode. Stateful только локально. */
function LabAnswerInput({
  lab, disabled,
  textValue, setTextValue,
  singleId, setSingleId,
  multiIds, setMultiIds,
}) {
  const mode = lab.check_mode;

  if (mode === "text_exact") {
    return (
      <input
        type="text"
        className="lab-text-input"
        value={textValue}
        onChange={(e) => setTextValue(e.target.value)}
        placeholder="Ваш ответ…"
        disabled={disabled}
        autoComplete="off"
      />
    );
  }

  if (mode === "numeric") {
    return (
      <div>
        <input
          type="text"
          inputMode="decimal"
          className="lab-text-input"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          placeholder="Числовой ответ"
          disabled={disabled}
          autoComplete="off"
        />
        <div className="lj-muted" style={{ fontSize: 12, marginTop: 6 }}>
          Точка или запятая как разделитель — оба варианта работают.
        </div>
      </div>
    );
  }

  if (mode === "single_choice") {
    return (
      <div className="lab-options">
        {(lab.options || []).map((o) => (
          <label key={o.id} className="lab-option">
            <input
              type="radio"
              name="lab-single"
              value={o.id}
              checked={singleId === o.id}
              onChange={() => setSingleId(o.id)}
              disabled={disabled}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </div>
    );
  }

  if (mode === "multiple_choice") {
    const toggle = (id) => {
      const next = new Set(multiIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setMultiIds(next);
    };
    return (
      <div className="lab-options">
        {(lab.options || []).map((o) => (
          <label key={o.id} className="lab-option">
            <input
              type="checkbox"
              value={o.id}
              checked={multiIds.has(o.id)}
              onChange={() => toggle(o.id)}
              disabled={disabled}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="lj-muted" style={{ fontSize: 13 }}>
      Преподаватель ещё не настроил режим проверки для этой лабы.
    </div>
  );
}
