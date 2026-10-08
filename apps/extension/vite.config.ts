import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "dist",
    emptyOutDir: mode === "background",
    rollupOptions: {
      input: mode === "background" ? "src/background.ts" : mode === "content" ? "src/content.ts" : mode === "options" ? "src/options.ts" : "src/popup.ts",
      output: { entryFileNames: `${mode}.js`, format: "iife" }
    }
  }
}));
