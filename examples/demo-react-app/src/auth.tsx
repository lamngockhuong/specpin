import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

// Lightweight in-memory auth for the demo only. There is no backend and no real
// security here: it exists so the multi-screen flow (login -> protected screens
// -> logout) feels coherent when trying Specpin.
interface AuthState {
  loggedIn: boolean;
  email: string | null;
  login: (email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);

  const value = useMemo<AuthState>(
    () => ({
      loggedIn: email !== null,
      email,
      login: (next: string) => setEmail(next || "demo@acme.test"),
      logout: () => setEmail(null),
    }),
    [email],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
