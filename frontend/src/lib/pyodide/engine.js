/**
 * PyodideEngine — promise-based обёртка над worker.js.
 *
 * Дизайн:
 *   - Singleton через getPyodideEngine(). Один Worker на всю сессию —
 *     инициализация Pyodide стоит ~1.4 сек и ~10 МБ загрузки, второй раз
 *     платить нельзя.
 *   - Корреляция запрос/ответ через nextId — Python-рантайм один и
 *     сериализует запросы в worker'е (последовательно).
 *   - onProgress подписки — для UI ("грузим Python… 1/3").
 *   - Auto-recovery: если worker фатально упал (OOM, corrupted runtime),
 *     engine пересоздаёт его сам — пользователю не нужно перезагружать
 *     страницу.
 *   - Timeout: engine.run(code, { timeoutMs }) — если worker не ответил,
 *     убиваем его (.terminate) и пересоздаём. Защита от зависших кодов
 *     юзера (бесконечный цикл).
 *
 * Использование:
 *   const engine = getPyodideEngine();
 *   const off = engine.onProgress((stage, detail) => console.log(stage, detail));
 *   await engine.init();
 *   const r = await engine.run("print('hi')", { testCode, packages, timeoutMs });
 *   off();
 */

let nextId = 1;

function createWorker() {
  // Vite канонично-Vite-way (new URL + import.meta.url) — корректно
  // бандлит worker в отдельный chunk в production.
  return new Worker(new URL("./worker.js", import.meta.url));
}


export class PyodideEngine {
  constructor() {
    this._spawn();
  }

  /**
   * Создать (или пересоздать) worker и зарегистрировать обработчики.
   * Вызывается из конструктора и при auto-recovery после фатальной ошибки.
   */
  _spawn() {
    this.worker = createWorker();
    this.pending = new Map();   // id → { resolve, reject, timer }
    this.progressListeners = this.progressListeners || new Set();
    this.initState = "idle";    // idle | initializing | ready | error
    this.initPromise = null;
    this.lastError = null;

    this.worker.onmessage = (e) => this._handleMessage(e.data);
    this.worker.onerror = (e) => this._handleFatalError(
      e?.message ? new Error(`Worker error: ${e.message}`)
                 : new Error("Worker error: unknown"),
    );
  }

  /**
   * Фатальная ошибка worker'а или timeout. Reject все pending запросы,
   * terminate старый worker, пересоздаём (auto-recovery). Сразу после
   * этого engine снова готов к init() — следующий вызов engine.run()
   * сам поднимет Pyodide заново.
   */
  _handleFatalError(err) {
    this.lastError = err;
    for (const { reject, timer } of this.pending.values()) {
      if (timer) clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
    try {
      this.worker?.terminate();
    } catch { /* worker уже мёртв */ }
    // Пересоздаём, но сохраняем подписки на прогресс (юзер их не отменял)
    const savedListeners = this.progressListeners;
    this._spawn();
    this.progressListeners = savedListeners;
  }

  /** Подписка на события прогресса. Возвращает unsubscribe-функцию. */
  onProgress(callback) {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  /** Поднять Pyodide. Идемпотентно — повторные вызовы возвращают тот же promise. */
  async init() {
    if (this.initState === "ready") return;
    if (this.initPromise) return this.initPromise;

    this.initState = "initializing";
    const id = nextId++;
    this.initPromise = new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: () => { this.initState = "ready"; resolve(); },
        reject: (e) => { this.initState = "error"; reject(e); },
        timer: null,
      });
      this.worker.postMessage({ type: "init", id });
    });
    return this.initPromise;
  }

  /**
   * Выполнить Python-код.
   * @param {string} code
   * @param {object} [opts]
   * @param {string|null}    [opts.testCode=null]
   * @param {string[]|null}  [opts.packages=null]
   * @param {number|null}    [opts.timeoutMs=null] — если задан и положительный,
   *        worker терминируется по таймауту (защита от зависшего кода).
   * @returns {Promise<{stdout, stderr, value, pyError, isCorrect}>}
   */
  async run(code, { testCode = null, packages = null, timeoutMs = null } = {}) {
    await this.init();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      let timer = null;
      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          // Worker завис на бесконечном цикле/чём-то ещё — убиваем и
          // пересоздаём через _handleFatalError. Юзер увидит timeout-ошибку,
          // следующий run() поднимет worker заново.
          this._handleFatalError(
            new Error(`Превышен таймаут выполнения (${timeoutMs} мс)`),
          );
          reject(new Error(`Превышен таймаут выполнения (${timeoutMs} мс)`));
        }, timeoutMs);
      }
      this.pending.set(id, {
        resolve: (r) => { if (timer) clearTimeout(timer); resolve(r); },
        reject: (e) => { if (timer) clearTimeout(timer); reject(e); },
        timer,
      });
      this.worker.postMessage({ type: "run", id, code, testCode, packages });
    });
  }

  /** Прибить worker и сбросить state. После этого engine непригоден. */
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const { reject, timer } of this.pending.values()) {
      if (timer) clearTimeout(timer);
      reject(new Error("Engine destroyed"));
    }
    this.pending.clear();
    this.progressListeners.clear();
    this.initState = "idle";
    this.initPromise = null;
  }

  _handleMessage(msg) {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "progress") {
      for (const cb of this.progressListeners) {
        try { cb(msg.stage, msg.detail); } catch { /* listener сломался — не наша забота */ }
      }
      return;
    }

    if (msg.type === "init-done") {
      const p = this.pending.get(msg.id);
      if (p) {
        p.resolve();
        this.pending.delete(msg.id);
      }
      return;
    }

    if (msg.type === "result") {
      const p = this.pending.get(msg.id);
      if (p) {
        p.resolve({
          stdout: msg.stdout || "",
          stderr: msg.stderr || "",
          value: msg.value,
          pyError: msg.pyError,
          isCorrect: msg.isCorrect,
        });
        this.pending.delete(msg.id);
      }
      return;
    }

    if (msg.type === "error") {
      const p = this.pending.get(msg.id);
      if (p) {
        p.reject(new Error(msg.message || "Pyodide error"));
        this.pending.delete(msg.id);
      }
      this.lastError = new Error(msg.message || "Pyodide error");
      return;
    }
  }
}


// Singleton — один Worker на весь lifetime приложения.
let globalEngine = null;

export function getPyodideEngine() {
  if (!globalEngine) globalEngine = new PyodideEngine();
  return globalEngine;
}

/** Принудительно пересоздать engine. Обычно auto-recovery в _handleFatalError
 *  справляется сам, но если нужен полный reset снаружи — этот метод. */
export function resetPyodideEngine() {
  if (globalEngine) globalEngine.destroy();
  globalEngine = null;
}
