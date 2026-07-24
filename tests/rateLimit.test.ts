import { describe, expect, it, beforeEach } from "vitest";
import {
  BETA_GUESS_LIMIT,
  checkRateLimit,
  hitRateLimit,
  resetRateLimitBuckets,
} from "@/lib/rateLimit";

describe("checkRateLimit / hitRateLimit", () => {
  beforeEach(() => {
    resetRateLimitBuckets();
  });

  it("allows up to the limit then blocks until the window resets", () => {
    const key = "beta-guess:1.2.3.4";
    const windowMs = 60_000;
    let now = 1_000_000;

    for (let i = 0; i < BETA_GUESS_LIMIT; i++) {
      expect(checkRateLimit(key, BETA_GUESS_LIMIT, windowMs, now).ok).toBe(
        true
      );
      hitRateLimit(key, windowMs, now);
    }

    const blocked = checkRateLimit(key, BETA_GUESS_LIMIT, windowMs, now);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }

    now += windowMs;
    expect(checkRateLimit(key, BETA_GUESS_LIMIT, windowMs, now).ok).toBe(true);
  });
});
