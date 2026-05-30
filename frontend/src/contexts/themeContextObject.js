// Голый контекст-объект. В отдельном файле, чтобы react-refresh/only-export-components
// не ругался при импорте useTheme и ThemeProvider из разных мест.
// См. пару authContextObject.js / AuthContext.jsx / useAuth.js — тот же паттерн.

import { createContext } from "react";

export const ThemeContext = createContext(null);
