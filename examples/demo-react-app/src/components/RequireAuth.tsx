import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth.js";

// Redirects to /login when there is no in-memory session. Demo-only gate.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loggedIn } = useAuth();
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
