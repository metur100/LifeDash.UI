import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages needs a repo sub-path; Cloudflare Pages serves from the root.
// Set VITE_BASE=/your-repo/ when building for GitHub Pages.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react()],
    base: env.VITE_BASE ?? "/",
    build: { outDir: "dist", sourcemap: mode !== "production" },
    server: { port: 5173 },
  };
});
