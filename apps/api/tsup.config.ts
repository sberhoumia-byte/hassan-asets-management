import { defineConfig } from "tsup";

// يحزم الخادم مع حزم المستودع المشتركة (@hassan/*). SWC يُصدر بيانات المزخرفات التي تحتاجها NestJS.
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  noExternal: [/^@hassan\//],
});
