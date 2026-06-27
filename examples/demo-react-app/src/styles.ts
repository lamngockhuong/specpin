import type { CSSProperties } from "react";

// Shared inline-style objects for the demo screens. Kept as plain objects (no CSS
// files) to match the original single-file demo and keep the example dependency-free
// beyond React + the router.
export const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 820,
    margin: "32px auto",
    padding: "0 16px",
    fontFamily: "system-ui, sans-serif",
    color: "#1f2937",
  },
  narrow: { maxWidth: 420 },
  lead: { color: "#6b7280" },
  h1: { margin: "0 0 4px" },
  h2: { margin: "24px 0 12px", fontSize: 18 },

  // Auth/login card
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 20,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
  },
  label: { display: "flex", flexDirection: "column", gap: 4, fontWeight: 600 },
  input: { padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontWeight: 400 },
  select: { padding: 8, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" },
  button: {
    padding: 10,
    border: "none",
    borderRadius: 6,
    background: "#4f46e5",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  buttonGhost: {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    background: "#fff",
    color: "#1f2937",
    cursor: "pointer",
    fontWeight: 600,
  },
  buttonDanger: {
    padding: 10,
    border: "1px solid #dc2626",
    borderRadius: 6,
    background: "#fff",
    color: "#dc2626",
    cursor: "pointer",
    fontWeight: 600,
  },
  link: { color: "#4f46e5", fontSize: 13 },
  error: { color: "#dc2626", fontSize: 13, fontWeight: 600 },

  // Top navigation
  nav: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    fontFamily: "system-ui, sans-serif",
  },
  navBrand: { fontWeight: 700, color: "#4f46e5", marginRight: 8 },
  navSpacer: { flex: 1 },

  // Dashboard stat cards
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
  },
  stat: {
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
  },
  statLabel: { color: "#6b7280", fontSize: 13 },
  statValue: { fontSize: 24, fontWeight: 700, marginTop: 4 },

  // Tables / lists
  table: { width: "100%", borderCollapse: "collapse", background: "#fff" },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "2px solid #e5e7eb",
    fontSize: 13,
    color: "#6b7280",
  },
  td: { padding: "8px 10px", borderBottom: "1px solid #f3f4f6" },
  feed: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
  },
  feedItem: { padding: "10px 14px", borderBottom: "1px solid #f3f4f6" },

  // Danger zone
  dangerZone: {
    marginTop: 24,
    padding: 16,
    border: "1px solid #fecaca",
    borderRadius: 10,
    background: "#fef2f2",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
  },
  toolbar: { display: "flex", gap: 8, margin: "12px 0" },
  inlineControl: { display: "flex", alignItems: "center", gap: 6 },
};
