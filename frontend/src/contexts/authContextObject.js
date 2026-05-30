import { createContext } from "react";

/** Context-object — вынесен в отдельный файл, чтобы React Fast Refresh не ругался. */
export const AuthContext = createContext(null);
