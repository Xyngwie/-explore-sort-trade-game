import { gameVersionDefine } from "../shared/build-version";
import path from "node:path";
import { defineConfig } from "vite";

/** Subpath for GitHub Pages project site, or `/` for Cloudflare/Vercel root. */
const base =
  process.env.VITE_BASE ?? process.env.BASE_PATH ?? "/";

export default defineConfig({
  define: gameVersionDefine(),
  root: ".",
  base,
  resolve: {
    alias: {
      "@estg/shared": path.resolve(__dirname, "../shared/src/index.ts"),
      "@estg/sort/canvas": path.resolve(__dirname, "../sort/src/canvas-api.ts"),
      "@estg/restore/canvas": path.resolve(__dirname, "../restore/src/canvas-api.ts"),
      "@estg/invade/canvas": path.resolve(__dirname, "../invade/src/canvas-api.ts"),
    },
  },
  server: { port: 5175 },
  // Two pages: the existing DOCK (index.html) and the canvas edition (canvas/index.html, docs/CANVAS_SHELL_V0.md).
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        canvas: path.resolve(__dirname, "canvas/index.html"),
        canvasRestore: path.resolve(__dirname, "canvas/restore/index.html"),
        canvasInvade: path.resolve(__dirname, "canvas/invade/index.html"),
      },
    },
  },
});
