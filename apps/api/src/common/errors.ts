import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";

/** خطأ عمل برمز ثابت (انظر API_DESIGN.md §1). */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, details }, status);
  }
}

export const E = {
  validation: (details: Record<string, unknown>) => new AppError("VALIDATION_ERROR", 400, details),
  unauthenticated: () => new AppError("UNAUTHENTICATED", 401),
  invalidCredentials: () => new AppError("INVALID_CREDENTIALS", 401),
  locked: (minutes: number) => new AppError("ACCOUNT_LOCKED", 423, { minutes }),
  forbidden: (permission?: string) => new AppError("FORBIDDEN", 403, permission ? { permission } : undefined),
  schoolDenied: () => new AppError("SCHOOL_ACCESS_DENIED", 403),
  notFound: () => new AppError("NOT_FOUND", 404),
  conflict: (code: string, details?: Record<string, unknown>) => new AppError(code, 409, details),
  rule: (code: string, details?: Record<string, unknown>) => new AppError(code, 422, details),
};

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private log = new Logger("Error");

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;

    if (err instanceof AppError) {
      return res.status(err.getStatus()).json({ error: { code: err.code, details: err.details, requestId } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: { code: "DUPLICATE", details: { target: err.meta?.target }, requestId } });
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const code =
        status === 400 ? "VALIDATION_ERROR" : status === 404 ? "NOT_FOUND" : status === 413 ? "PAYLOAD_TOO_LARGE" : status === 429 ? "TOO_MANY_REQUESTS" : "HTTP_ERROR";
      return res.status(status).json({ error: { code, requestId } });
    }
    this.log.error(err instanceof Error ? err.stack : String(err));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: "INTERNAL", requestId } });
  }
}
