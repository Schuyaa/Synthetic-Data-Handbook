import { useContext } from "react";
import { ThemeContext } from "./themeContextObject";

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme: компонент должен быть внутри <ThemeProvider>");
  }
  return ctx;
}
