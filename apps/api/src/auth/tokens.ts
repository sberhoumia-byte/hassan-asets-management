import { createHmac, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";
import { config } from "../config";

export const REFRESH_COOKIE = "hat_refresh";
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** لا يُخزن رمز التجديد نفسه، بل بصمته (HMAC بسرّ الخادم). */
export function hashRefreshToken(token: string): string {
  return createHmac("sha256", config().JWT_REFRESH_SECRET).update(token).digest("hex");
}

export function refreshCookieOptions(): CookieOptions {
  const c = config();
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: c.COOKIE_SECURE ?? c.NODE_ENV === "production",
    path: "/api/v1/auth",
    maxAge: c.JWT_REFRESH_TTL_DAYS * 24 * 3600 * 1000,
  };
}
