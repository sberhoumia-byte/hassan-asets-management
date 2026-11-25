import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { AppRequest } from "./context";

/** معرّف لكل طلب يُعاد في ترويسة X-Request-Id ويُسجل في التدقيق والأخطاء. */
export function requestId(req: AppRequest, res: Response, next: NextFunction) {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
