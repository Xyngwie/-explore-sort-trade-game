import path from "node:path";
import { defineConfig } from "vite";

/** Subpath for GitHub Pages project site, or `/` for Cloudflare/Vercel root. */
const base =
  process.env.VITE_BASE ?? process.env.BASE_PATH ?? "/";

export default defineConfig({
  root: ".",
  base,
  resolve: {
    alias: {
      "@estg/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: { port: 5175 },
});
