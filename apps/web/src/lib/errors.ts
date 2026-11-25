import { ApiError } from "../api/types";

/** مفتاح ترجمة مناسب لخطأ عام من الخادم (الأخطاء الخاصة بحقل تعالجها كل شاشة). */
export function errorKey(e: unknown): string {
  const code = e instanceof ApiError ? e.code : "";
  switch (code) {
    case "FORBIDDEN":
      return "errors.forbidden";
    case "SCHOOL_ACCESS_DENIED":
      return "errors.schoolDenied";
    case "NETWORK_ERROR":
      return "errors.network";
    case "PAYLOAD_TOO_LARGE":
      return "errors.fileTooLarge";
    case "VALIDATION_ERROR":
      return "errors.invalid";
    case "TOO_MANY_REQUESTS":
      return "errors.tooMany";
    default:
      return "errors.unexpected";
  }
}
