import { describe, expect, it } from "vitest";
import * as Api from "@workspace/api-zod";

const validDistributor = {
  companyName: "شركة اختبار",
  contactName: "مسؤول الاختبار",
  email: null,
};

describe("distributor phone contract", () => {
  it.each([
    "0551234567",
    "+966 50 123 4567",
    "+966-50-123-4567",
  ])("accepts supported phone format %s", (phone) => {
    expect(Api.AdminCreateDistributorBody.safeParse({ ...validDistributor, phone }).success).toBe(true);
  });

  it("rejects phone values outside the 8-15 digit limit", () => {
    expect(Api.AdminCreateDistributorBody.safeParse({ ...validDistributor, phone: "123" }).success).toBe(false);
  });
});