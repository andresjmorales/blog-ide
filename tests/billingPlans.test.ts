import { describe, expect, it } from "vitest";
import {
  FREE_QUOTA_BYTES,
  HOSTED_PLANS,
  HOSTED_PRO_PRICE_LABEL,
  PRO_QUOTA_BYTES,
  SELF_HOST_QUOTA_BYTES,
  formatQuotaMib,
  isSelfHostQuota,
  planFromSubscriptionStatus,
  quotaBytesForPlan,
} from "@/lib/billing/plans";
import { formatSubscriptionLabel } from "@/lib/billing/subscriptionLabel";

describe("hosted plan config", () => {
  it("keeps free at 10 MiB and pro at 100 MiB", () => {
    expect(FREE_QUOTA_BYTES).toBe(10 * 1024 * 1024);
    expect(PRO_QUOTA_BYTES).toBe(100 * 1024 * 1024);
    expect(quotaBytesForPlan("free")).toBe(FREE_QUOTA_BYTES);
    expect(quotaBytesForPlan("pro")).toBe(PRO_QUOTA_BYTES);
    expect(formatQuotaMib(PRO_QUOTA_BYTES)).toBe("100 MiB");
    expect(HOSTED_PRO_PRICE_LABEL).toBe("$5/mo");
    expect(HOSTED_PLANS.pro.priceLabel).toBe("$5/mo");
  });

  it("treats self-host quota as a large soft ceiling", () => {
    expect(SELF_HOST_QUOTA_BYTES).toBe(1024 * 1024 * 1024 * 1024);
    expect(isSelfHostQuota(SELF_HOST_QUOTA_BYTES)).toBe(true);
    expect(isSelfHostQuota(FREE_QUOTA_BYTES)).toBe(false);
  });
});

describe("planFromSubscriptionStatus", () => {
  it("treats active-like statuses as pro", () => {
    expect(planFromSubscriptionStatus("active")).toBe("pro");
    expect(planFromSubscriptionStatus("trialing")).toBe("pro");
    expect(planFromSubscriptionStatus("past_due")).toBe("pro");
  });

  it("downgrades canceled / unpaid / missing", () => {
    expect(planFromSubscriptionStatus("canceled")).toBe("free");
    expect(planFromSubscriptionStatus("unpaid")).toBe("free");
    expect(planFromSubscriptionStatus(null)).toBe("free");
  });
});

describe("formatSubscriptionLabel", () => {
  it("returns null for free", () => {
    expect(
      formatSubscriptionLabel({
        plan: "free",
        subscriptionStatus: null,
        cancelAt: null,
      })
    ).toBeNull();
  });

  it("shows active / cancels-on copy for pro", () => {
    expect(
      formatSubscriptionLabel({
        plan: "pro",
        subscriptionStatus: "active",
        cancelAt: null,
      })
    ).toBe("Pro subscription active");
    expect(
      formatSubscriptionLabel({
        plan: "pro",
        subscriptionStatus: "active",
        cancelAt: "2026-08-15T12:00:00.000Z",
      })
    ).toMatch(/^Cancels on /);
  });
});
