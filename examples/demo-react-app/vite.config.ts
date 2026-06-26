import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Demo app for trying Specpin. Prefers localhost:3000 to match the seeded
// .specs/manifest.json domains; if 3000 is busy Vite falls back to 3001, which
// the manifest also allows out of the box.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  preview: { port: 3000 },
});
