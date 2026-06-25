import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Demo app for trying Specpin. Runs on localhost:3000 so it matches the seeded
// .specs/manifest.json domains out of the box.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  preview: { port: 3000 },
});
