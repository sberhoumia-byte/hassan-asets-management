import { describe, expect, it } from "vitest";
import { dueEndOfDay, lateDays } from "./loans";

describe("احتساب التأخير", () => {
  const due = dueEndOfDay("2026-11-25");
  it("لا تأخير خلال يوم الاستحقاق", () => {
    expect(lateDays(due, new Date("2026-11-25T08:00:00Z"))).toBe(0);
    expect(lateDays(due, new Date("2026-11-25T23:59:59Z"))).toBe(0);
  });
  it("جزء من اليوم التالي = يوم تأخير", () => {
    expect(lateDays(due, new Date("2026-11-26T00:00:01Z"))).toBe(1);
    expect(lateDays(due, new Date("2026-11-26T22:00:00Z"))).toBe(1);
  });
  it("عدة أيام", () => {
    expect(lateDays(due, new Date("2026-12-02T09:00:00Z"))).toBe(7);
  });
});
