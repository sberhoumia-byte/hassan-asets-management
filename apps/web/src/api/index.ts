import { ReviewApi } from "./review/reviewApi";
import { HttpApi } from "./http/httpApi";
import type { Api } from "./types";

/**
 * وضع «review» (ملف HTML واحد للمراجعة): بيانات محلية في المتصفح.
 * غير ذلك: الخادم الحقيقي عبر /api/v1 (أو VITE_API_URL إن كان الخادم على أصل آخر).
 */
export const api: Api =
  import.meta.env.MODE === "review" ? new ReviewApi() : new HttpApi(import.meta.env.VITE_API_URL ?? "/api/v1");
export * from "./types";
export * from "./phase4";
export * from "./phase6";
export * from "./phase7";
export * from "./phase7b";
