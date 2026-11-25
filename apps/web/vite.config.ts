import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// mode "review": ملف HTML واحد مستقل (JS وCSS والخطوط مضمنة) لمشاركة نسخة المراجعة.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), tailwindcss(), ...(mode === "review" ? [viteSingleFile()] : [])],
  server: { port: 5173 },
  build:
    mode === "review"
      ? { target: "es2022", outDir: "dist-review", assetsInlineLimit: 100_000_000 }
      : { target: "es2022", sourcemap: true },
}));
