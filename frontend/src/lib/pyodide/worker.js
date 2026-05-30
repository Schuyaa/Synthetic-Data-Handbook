/**
 * Web Worker для Pyodide. Грузит рантайм с CDN, исполняет Python в
 * отдельном потоке — UI на главном потоке не фризится на 1-2 сек
 * инициализации и на тяжёлых вычислениях.
 *
 * Протокол сообщений (main → worker):
 *   { type: "init", id }                                   — поднять Pyodide (идемпотентно)
 *   { type: "run",  id, code, testCode?, packages? }       — выполнить код.
 *      packages: массив имён ["numpy","pandas"] — загружаются через
 *      pyodide.loadPackage() перед выполнением. Idempotent (Pyodide
 *      кеширует уже загруженные пакеты).
 *      testCode (опц.) конкатенируется через "\n\n# --- TESTS ---\n"
 *      и его прохождение даёт isCorrect=true.
 *
 * Протокол сообщений (worker → main):
 *   { type: "progress", stage, detail? }       — "loading-script" |
 *                                                 "loading-runtime" |
 *                                                 "loading-packages" (detail: список) |
 *                                                 "ready"
 *   { type: "init-done", id }                  — init успешен
 *   { type: "result", id, stdout, stderr,      — результат run
 *     value, pyError, isCorrect }
 *   { type: "error", id, message, stage? }     — фатальная ошибка (не Python-исключение)
 *
 * Различие pyError vs error:
 *   - pyError — Python кинул исключение (включая AssertionError из тестов).
 *     Это ожидаемый ход событий, не повод считать что worker сломан.
 *   - error — что-то упало вне Python: CDN недоступен, OOM в WASM, корраптится
 *     рантайм. Engine на стороне main потока пересоздаст worker.
 *
 * Classic worker (не module) — потому что Pyodide CDN-скрипт грузим
 * через self.importScripts(), а в module-worker'ах его нет (только import).
 */

const PYODIDE_VERSION = "0.27.7";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodide = null;
let initPromise = null;

async function initPyodide() {
  if (pyodide) return pyodide;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    self.postMessage({ type: "progress", stage: "loading-script" });
    // importScripts блокирующий, но в worker'е это норма — главный поток не страдает.
    self.importScripts(`${PYODIDE_CDN}pyodide.js`);

    self.postMessage({ type: "progress", stage: "loading-runtime" });
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN });

    self.postMessage({ type: "progress", stage: "ready" });
    return pyodide;
  })();

  return initPromise;
}


async function handleRun(msg) {
  const { id, code, testCode, packages } = msg;
  let py;
  try {
    py = await initPyodide();
  } catch (err) {
    self.postMessage({ type: "error", id, stage: "init", message: String(err?.message || err) });
    return;
  }

  // Если задача требует пакеты (numpy/pandas/scipy/…) — подтягиваем через
  // pyodide.loadPackage(). Idempotent: уже загруженные skip автоматически.
  // Первый раз numpy грузится ~3-5 сек (4 МБ), потом из browser cache мгновенно.
  if (Array.isArray(packages) && packages.length > 0) {
    try {
      self.postMessage({
        type: "progress",
        stage: "loading-packages",
        detail: packages,
      });
      await py.loadPackage(packages);
    } catch (err) {
      // Отдаём как обычный pyError — пользователь увидит в console.
      // testCode → isCorrect=false (без пакетов тесты всё равно упадут).
      self.postMessage({
        type: "result",
        id,
        stdout: "",
        stderr: "",
        value: null,
        pyError: `Не удалось загрузить пакеты (${packages.join(", ")}): ${String(err?.message || err)}`,
        isCorrect: testCode ? false : null,
      });
      return;
    }
  }

  // Перехват stdout/stderr в буферы. setStdout/setStderr с batched-handler
  // вызывает callback на каждой строке (после \n).
  let stdout = "";
  let stderr = "";
  py.setStdout({ batched: (s) => { stdout += s + "\n"; } });
  py.setStderr({ batched: (s) => { stderr += s + "\n"; } });

  // Конкатенация user-кода и тестов. Разделитель — комментарий, чтобы при
  // ошибке traceback показывал понятный контекст ("at line X in TESTS").
  const fullCode = testCode
    ? `${code}\n\n# --- TESTS ---\n${testCode}`
    : code;

  // Изолированный namespace для КАЖДОГО запуска — иначе переменные
  // прошлого Run переживают в следующий. Студент мог `solve = lambda: 6`
  // в Run, потом в Submit тесты бы прошли благодаря этому глобалу.
  // py.toPy({}) создаёт пустой Python dict, runPythonAsync({ globals })
  // изолирует выполнение от self.globals.
  const isolatedGlobals = py.toPy({});

  let value;
  let runException = null;
  try {
    value = await py.runPythonAsync(fullCode, { globals: isolatedGlobals });
  } catch (err) {
    runException = err;
  } finally {
    // PyProxy требует явного destroy() — иначе wasm-память не освобождается.
    try { isolatedGlobals.destroy(); } catch { /* уже destroyed — ок */ }
  }

  if (runException) {
    // Python-исключение. Для тестов это означает is_correct=false (assert
    // упал или в user-коде была ошибка). Для просто "Run" — отдадим pyError,
    // фронт покажет как красный traceback.
    self.postMessage({
      type: "result",
      id,
      stdout,
      stderr,
      value: null,
      pyError: String(runException?.message || runException),
      // null если testCode не было: в режиме "просто запустить" нет понятия
      // правильного/неправильного. False если тесты были — упали.
      isCorrect: testCode ? false : null,
    });
    return;
  }

  // Успех. Если был testCode и до сюда дошли — все assert прошли.
  self.postMessage({
    type: "result",
    id,
    stdout,
    stderr,
    // value === undefined когда последнее выражение — statement (print, assign).
    // Сериализуем как строку — proxy-объекты Pyodide через postMessage не пройдут.
    value: value === undefined ? null : String(value),
    pyError: null,
    isCorrect: testCode ? true : null,
  });
}


self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "init") {
    try {
      await initPyodide();
      self.postMessage({ type: "init-done", id: msg.id });
    } catch (err) {
      self.postMessage({ type: "error", id: msg.id, stage: "init", message: String(err?.message || err) });
    }
    return;
  }

  if (msg.type === "run") {
    await handleRun(msg);
    return;
  }
};
