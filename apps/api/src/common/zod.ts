import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { ZodType } from "zod";
import { E } from "./errors";

/** يتحقق من جسم الطلب بمخطط Zod المشترك مع الواجهة (@hassan/validation). */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const issue of r.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message; // أول خطأ لكل حقل
    throw E.validation({ fields });
  }
  return r.data;
}

export const ZBody = (schema: ZodType) =>
  createParamDecorator((_: unknown, ctx: ExecutionContext) => parse(schema, ctx.switchToHttp().getRequest().body))();
