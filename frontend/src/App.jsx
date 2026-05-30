import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import RequireAuth from "./contexts/RequireAuth";

import HomePage from "./pages/HomePage";
import LearnPage from "./pages/LearnPage";
import LabPage from "./pages/LabPage";
import UserPage from "./pages/UserPage";
import AdminPage from "./pages/AdminPage";
import UserProgressPage from "./pages/UserProgressPage";

export default function App() {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Router>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />

              {/* Страница главы */}
              <Route path="/chapter/:slug" element={<LearnPage />} />

              {/* Страница лабораторной (привязанной к главе или standalone в теме) */}
              <Route path="/lab/:slug" element={<LabPage />} />

              <Route
                path="/user"
                element={
                  <RequireAuth>
                    <UserPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAuth roles={["admin", "teacher"]}>
                    <AdminPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/user/:id/progress"
                element={
                  <RequireAuth roles={["admin", "teacher"]}>
                    <UserProgressPage />
                  </RequireAuth>
                }
              />

              {/* если кто-то попал на неизвестный путь */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
