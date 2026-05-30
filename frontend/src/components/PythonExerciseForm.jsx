/**
 * PythonExerciseForm — workspace для лабы с check_mode === "python_code".
 *
 * UI в стиле CodeWars/LeetCode:
 *   - 3 вкладки: Решение / Тесты (readonly) / Вывод (console-style)
 *   - Редактор тянется на всю доступную высоту правой колонки
 *   - Console-style вывод (тёмный фон, цветные строки, prompt-маркеры)
 *   - Большой verdict через lab-py-verdict (в LabPage, после формы)
 *
 * Состояние сохраняется в localStorage per-user, см. helpers ниже.
 *
 * Engine — singleton, грузит Pyodide один раз на сессию (см. lib/pyodide/engine.js).
 */

import { useEffect, useRef, useState } from "react";

import PythonEditor from "./PythonEditor";
import { useTheme } from "../contexts/useTheme";
import { getPyodideEngine } from "../lib/pyodide/engine";


// ── localStorage helpers ─────────────────────────────────────────
const STORAGE_PREFIX = "lab_code_";

function getStorageKey(userId, labId) {
  return `${STORAGE_PREFIX}${userId || "guest"}_${labId}`;
}

function loadSavedCode(userId, labId, fallback) {
  try {
    const v = localStorage.getItem(getStorageKey(userId, labId));
    return typeof v === "string" ? v : fallback;
  } catch {
    return fallback;
  }
}

function saveCode(userId, labId, code) {
  try {
    localStorage.setItem(getStorageKey(userId, labId), code);
  } catch {
    /* QuotaExceeded или private mode — тихо игнорим */
  }
}

function clearSavedCode(userId, labId) {
  try {
    localStorage.removeItem(getStorageKey(userId, labId));
  } catch {
    /* same */
  }
}


export default function PythonExerciseForm({
  lab,
  user,
  disabled,
  onSubmit,
  submitting,
}) {
  const { theme } = useTheme();
  const userId = user?.id || null;

  // Стартуем из localStorage, fallback на lab.starter_code.
  const [code, setCode] = useState(() =>
    loadSavedCode(userId, lab.id, lab.starter_code || ""),
  );

  // engineState: initializing | ready | running | error.
  const [engineState, setEngineState] = useState("initializing");
  const [progressStage, setProgressStage] = useState("");
  // detail для прогресса (например, имена пакетов при loading-packages)
  const [progressDetail, setProgressDetail] = useState(null);
  const [engineError, setEngineError] = useState("");

  // Результат последнего Run/Submit.
  // null до первого запуска / после reset.
  const [runOutput, setRunOutput] = useState(null);
  // "run" | "submit" | null — какой режим в last action (для лейбла кнопки + console prompt)
  const [lastAction, setLastAction] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);

  // Активная вкладка: solution | tests | output
  const [activeTab, setActiveTab] = useState("solution");

  const engineRef = useRef(null);
  // Защита от двойного клика на Run/Submit — синхронный гард,
  // не state (setState async, между click'ами есть микро-окно).
  const busyRef = useRef(false);

  // Save code в localStorage на каждое изменение.
  useEffect(() => {
    saveCode(userId, lab.id, code);
  }, [code, userId, lab.id]);

  // Pyodide init — singleton, грузится один раз на сессию.
  useEffect(() => {
    const engine = getPyodideEngine();
    engineRef.current = engine;

    const offProgress = engine.onProgress((s, detail) => {
      setProgressStage(s);
      setProgressDetail(detail || null);
    });

    let cancelled = false;
    engine.init()
      .then(() => {
        if (cancelled) return;
        setEngineState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setEngineError(String(e?.message || e));
        setEngineState("error");
      });

    return () => {
      cancelled = true;
      offProgress();
    };
  }, []);


  const handleReset = () => {
    if (!window.confirm("Сбросить код к стартовому? Текущий код будет потерян.")) return;
    setCode(lab.starter_code || "");
    clearSavedCode(userId, lab.id);
  };

  // Пакеты из lab.required_packages подгружаются автоматически перед каждым
  // запуском кода (Pyodide idempotent — повторы из cache мгновенные).
  const packages = Array.isArray(lab.required_packages) && lab.required_packages.length > 0
    ? lab.required_packages
    : null;
  // Таймаут выполнения: lab.timeout_seconds или 5 по умолчанию.
  // Передаётся в engine.run — если код юзера зависнет, worker терминируется.
  const timeoutMs = ((lab.timeout_seconds || 5) * 1000);

  const handleRun = async () => {
    if (busyRef.current) return;  // защита от двойного клика
    const engine = engineRef.current;
    if (!engine) return;
    busyRef.current = true;
    setLastAction("run");
    setRunOutput(null);
    setActiveTab("output");
    const t0 = performance.now();
    setEngineState("running");
    try {
      const r = await engine.run(code, { packages, timeoutMs });
      setRunOutput(r);
      setElapsedMs(Math.round(performance.now() - t0));
      setEngineState("ready");
    } catch (e) {
      setRunOutput({
        stdout: "", stderr: "", value: null,
        pyError: String(e?.message || e),
        isCorrect: null,
      });
      setElapsedMs(Math.round(performance.now() - t0));
      setEngineState("error");
    } finally {
      busyRef.current = false;
    }
  };

  const handleSubmit = async () => {
    if (busyRef.current) return;  // защита от двойного клика
    const engine = engineRef.current;
    if (!engine || typeof onSubmit !== "function") return;
    busyRef.current = true;
    setLastAction("submit");
    setRunOutput(null);
    setActiveTab("output");
    const t0 = performance.now();
    setEngineState("running");
    try {
      const r = await engine.run(code, { testCode: lab.test_code, packages, timeoutMs });
      setRunOutput(r);
      setElapsedMs(Math.round(performance.now() - t0));
      setEngineState("ready");
      onSubmit(code, r.isCorrect === true, r);
    } catch (e) {
      setRunOutput({
        stdout: "", stderr: "", value: null,
        pyError: String(e?.message || e),
        isCorrect: false,
      });
      setElapsedMs(Math.round(performance.now() - t0));
      setEngineState("error");
      onSubmit(code, false, null);
    } finally {
      busyRef.current = false;
    }
  };

  const isInitializing = engineState === "initializing";
  const isRunning = engineState === "running";
  const canRun = !isRunning && (engineState === "ready" || engineState === "error");
  const canSubmit = canRun && !disabled && !submitting && Boolean(lab.test_code);
  const canReset = !isRunning && code !== (lab.starter_code || "");

  return (
    <div className="lab-py-form">
      {isInitializing && (
        <div className="lj-muted" style={{ fontSize: 13, marginBottom: 8 }}>
          {progressStage === "loading-script"
            ? "Загружаем Python (~10 МБ, разово)…"
            : progressStage === "loading-runtime"
              ? "Инициализация рантайма…"
              : "Готовим редактор…"}
        </div>
      )}

      {engineState === "error" && engineError && !runOutput && (
        <div className="lab-status lab-status--bad" style={{ marginBottom: 8 }}>
          Не удалось загрузить Python: {engineError}
        </div>
      )}

      {!lab.test_code && (
        <div className="lab-status lab-status--info" style={{ marginBottom: 8, fontSize: 13 }}>
          Преподаватель ещё не настроил проверку. Кнопка «Запустить» работает,
          но «Проверить» будет недоступна.
        </div>
      )}

      <div className="lab-py-workspace">
        {/* Tabs */}
        <div className="lab-py-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "solution"}
            className={`lab-py-tab${activeTab === "solution" ? " is-active" : ""}`}
            onClick={() => setActiveTab("solution")}
          >
            Решение
          </button>
          {lab.test_code && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tests"}
              className={`lab-py-tab${activeTab === "tests" ? " is-active" : ""}`}
              onClick={() => setActiveTab("tests")}
              title="Тесты, по которым проверяется задача"
            >
              Тесты
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "output"}
            className={`lab-py-tab${activeTab === "output" ? " is-active" : ""}`}
            onClick={() => setActiveTab("output")}
          >
            Вывод
            {runOutput && (runOutput.pyError || runOutput.isCorrect === false) && (
              <span className="lab-py-tab-dot lab-py-tab-dot--err" aria-hidden="true">●</span>
            )}
            {runOutput && runOutput.isCorrect === true && (
              <span className="lab-py-tab-dot lab-py-tab-dot--ok" aria-hidden="true">●</span>
            )}
          </button>
        </div>

        {/* Tab content */}
        <div className="lab-py-tab-content">
          {activeTab === "solution" && (
            <PythonEditor
              value={code}
              onChange={setCode}
              theme={theme}
              editable={!isRunning}
              height="100%"
            />
          )}
          {activeTab === "tests" && lab.test_code && (
            <PythonEditor
              value={lab.test_code}
              theme={theme}
              editable={false}
              height="100%"
            />
          )}
          {activeTab === "output" && (
            <PyOutputConsole
              runOutput={runOutput}
              lastAction={lastAction}
              elapsedMs={elapsedMs}
              isRunning={isRunning}
              progressStage={progressStage}
              progressDetail={progressDetail}
            />
          )}
        </div>

        {/* Buttons */}
        <div className="lab-py-form-foot">
          <button
            type="button"
            className="btn-outline"
            onClick={handleRun}
            disabled={!canRun}
            title="Запустить код для отладки. Не списывает попытку."
          >
            {isRunning && lastAction === "run" ? "Выполняется…" : "Запустить"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={!lab.test_code ? "Тесты не настроены" : disabled ? "Недоступно" : ""}
          >
            {submitting || (isRunning && lastAction === "submit") ? "Проверяем…" : "Проверить"}
          </button>
          {canReset && (
            <button
              type="button"
              className="btn-outline"
              onClick={handleReset}
              style={{ marginLeft: "auto", fontSize: 12 }}
              title="Вернуть код к стартовому"
            >
              Сбросить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * Console-style вывод. Прозрачно показывает что произошло:
 *   $ python solution.py        24 ms
 *   <stdout>
 *   <stderr / pyError (красным)>
 *   ⏎ <return value> (для Run, не Submit)
 *   ✓ Все тесты пройдены / ✗ Тесты не пройдены  (для Submit)
 */
function PyOutputConsole({ runOutput, lastAction, elapsedMs, isRunning, progressStage, progressDetail }) {
  if (isRunning) {
    // Во время выполнения может быть стадия "loading-packages" —
    // подгружаем numpy/pandas/etc. Показываем явно чтобы юзер не
    // думал что зависло.
    const isLoadingPackages = progressStage === "loading-packages";
    const pkgList = Array.isArray(progressDetail) ? progressDetail.join(", ") : "";

    return (
      <div className="lab-py-console">
        <div className="lab-py-console-line lab-py-console-line--prompt">
          $ {lastAction === "submit" ? "запуск решения + тесты…" : "запуск решения…"}
        </div>
        {isLoadingPackages && (
          <div className="lab-py-console-line lab-py-console-line--dim">
            ▸ Загружаем пакет(ы): {pkgList} (первый раз ~3-10 сек, потом из кэша)
          </div>
        )}
      </div>
    );
  }

  if (!runOutput) {
    return (
      <div className="lab-py-console">
        <div className="lab-py-console-empty">
          Нажми «Запустить» для отладочного прогона или «Проверить» для отправки решения.
        </div>
      </div>
    );
  }

  const { stdout, stderr, pyError, value, isCorrect } = runOutput;
  const verdict = lastAction === "submit"
    ? (isCorrect === true ? "ok" : "bad")
    : null;

  return (
    <div className="lab-py-console">
      <div className="lab-py-console-line lab-py-console-line--prompt">
        $ {lastAction === "submit" ? "решение + тесты" : "решение"}
        {elapsedMs != null && (
          <span className="lab-py-console-time">  · {elapsedMs} ms</span>
        )}
      </div>
      {stdout && (
        <div className="lab-py-console-line">{stdout.trimEnd()}</div>
      )}
      {stderr && (
        <div className="lab-py-console-line lab-py-console-line--err">{stderr.trimEnd()}</div>
      )}
      {pyError && (
        <div className="lab-py-console-line lab-py-console-line--err">{pyError}</div>
      )}
      {!pyError && value != null && value !== "None" && lastAction === "run" && (
        <div className="lab-py-console-line lab-py-console-line--dim">⏎ {value}</div>
      )}
      {verdict === "ok" && (
        <div className="lab-py-console-line lab-py-console-line--ok">
          ✓ Все тесты пройдены
        </div>
      )}
      {verdict === "bad" && !pyError && (
        <div className="lab-py-console-line lab-py-console-line--err">
          ✗ Тесты не пройдены
        </div>
      )}
    </div>
  );
}
