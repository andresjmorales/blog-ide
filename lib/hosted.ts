/**
 * Hosted vs self-host deployment framing (track 7).
 * Default is self-host — only blogide.com (or other hosted deploys) set
 * NEXT_PUBLIC_HOSTED=true.
 *
 * Plan quotas / list prices live in lib/billing/plans.ts (public, intentional).
 */

import { HOSTED_PRO_PRICE_LABEL } from "@/lib/billing/plans";

export type DeploymentMode = "self_hosted" | "hosted";

export { HOSTED_PRO_PRICE_LABEL };

export function isHostedDeployment(
  env: Record<string, string | undefined> = process.env
): boolean {
  const raw = env.NEXT_PUBLIC_HOSTED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function getDeploymentMode(
  env: Record<string, string | undefined> = process.env
): DeploymentMode {
  return isHostedDeployment(env) ? "hosted" : "self_hosted";
}
