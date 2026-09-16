import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  resolve: {
    alias: {
      "@estg/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: { port: 5173 },
});
