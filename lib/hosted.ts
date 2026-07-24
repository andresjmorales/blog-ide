/**
 * Hosted vs self-host deployment framing (track 7).
 * Default is self-host — only blogide.com (or other hosted deploys) set
 * NEXT_PUBLIC_HOSTED=true.
 *
 * Beta codes: prefer NEXT_PUBLIC_BETA_ONLY=true on invite-only hosted deploys
 * (redundant with HOSTED so the signup field still shows if one flag is missing
 * from the client bundle). Self-host leaves both unset.
 *
 * Plan quotas / list prices live in lib/billing/plans.ts (public, intentional).
 */

import { HOSTED_PRO_PRICE_LABEL } from "@/lib/billing/plans";

export type DeploymentMode = "self_hosted" | "hosted";

export { HOSTED_PRO_PRICE_LABEL };

function envFlag(
  name: string,
  env: Record<string, string | undefined>
): boolean | undefined {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return undefined;
}

export function isHostedDeployment(
  env: Record<string, string | undefined> = process.env
): boolean {
  return envFlag("NEXT_PUBLIC_HOSTED", env) === true;
}

/**
 * Whether signup requires a beta code (UI field + API validation).
 * - NEXT_PUBLIC_BETA_ONLY=true/false wins when set
 * - otherwise falls back to hosted (invite-only while beta lasts)
 */
export function requiresBetaCode(
  env: Record<string, string | undefined> = process.env
): boolean {
  const explicit = envFlag("NEXT_PUBLIC_BETA_ONLY", env);
  if (explicit !== undefined) return explicit;
  return isHostedDeployment(env);
}

export function getDeploymentMode(
  env: Record<string, string | undefined> = process.env
): DeploymentMode {
  return isHostedDeployment(env) ? "hosted" : "self_hosted";
}
