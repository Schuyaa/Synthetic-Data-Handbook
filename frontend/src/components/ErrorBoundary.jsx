import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "60vh", padding: "2rem",
          textAlign: "center"
        }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Что-то пошло не так</h2>
          <p style={{ color: "var(--foregroundAlt)", marginBottom: "1.5rem" }}>
            Произошла непредвиденная ошибка
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.6rem 1.5rem", borderRadius: "4px",
              border: "1px solid var(--borderPrimary)",
              background: "var(--backgroundBase)", cursor: "pointer",
              color: "var(--foregroundDefault)", font: "inherit"
            }}
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
