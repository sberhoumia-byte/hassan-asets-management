import { ReviewApi } from "./review/reviewApi";
import type { Api } from "./types";

/** في المرحلة 3: export const api: Api = new HttpApi(import.meta.env.VITE_API_URL). */
export const api: Api = new ReviewApi();
export * from "./types";
