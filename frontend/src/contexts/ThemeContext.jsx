/**
 * ThemeProvider — единый источник истины для светлой/тёмной темы.
 *
 * Зачем context, а не просто useState-хук:
 *   Раньше useTheme был обычным хуком — каждый компонент получал свой
 *   локальный state. При переключении темы в SiteHeader его state менялся,
 *   localStorage обновлялся, data-theme на <html> переключался, но другие
 *   компоненты (PythonEditor через PythonExerciseForm) видели свой
 *   устаревший state и не перерисовывались с новой темой. Особенно
 *   заметно на CodeMirror — он переключал тему только при полной
 *   перезагрузке.
 *
 *   Context даёт единое значение theme для всего поддерева. setTheme
 *   в одном месте → React уведомляет всех потребителей → они рендерятся
 *   с новым значением.
 *
 * Структура файлов (как у authContextObject + AuthContext + useAuth):
 *   - themeContextObject.js — createContext (объект)
 *   - ThemeContext.jsx (этот) — компонент ThemeProvider
 *   - useTheme.js — хук useTheme
 *
 * Разделение нужно из-за react-refresh/only-export-components, который
 * запрещает миксовать экспорт компонента и не-компонента в одном файле.
 */

import { useCallback, useEffect, useState } from "react";
import { ThemeContext } from "./themeContextObject";

const STORAGE_KEY = "theme";

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Чтобы избежать flash of wrong theme — initial читаем синхронно.
    // index.html также делает inline-set перед маунтом React (см. <script>
    // в самом начале body), так что data-theme уже правильный в момент
    // гидрации, и наш state синхронизируется с ним.
    try {
      return localStorage.getItem(STORAGE_KEY) || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Privacy mode / quota — игнорируем
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
