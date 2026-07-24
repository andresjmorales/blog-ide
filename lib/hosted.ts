/**
 * Hosted vs self-host deployment framing (track 7).
 * Default is self-host — only blogide.com (or other hosted deploys) set
 * NEXT_PUBLIC_HOSTED=true.
 *
 * Beta codes: prefer NEXT_PUBLIC_BETA_ONLY=true on invite-only hosted deploys
 * (redundant with HOSTED). Self-host leaves both unset.
 *
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_* into the client bundle when
 * accessed as a literal (`process.env.NEXT_PUBLIC_HOSTED`). Dynamic lookups
 * like `process.env[name]` are undefined in the browser (server still works),
 * which made SignupForm show the self-host copy while the API required a beta
 * code. Keep the default path on literal reads.
 *
 * Plan quotas / list prices live in lib/billing/plans.ts (public, intentional).
 */

import { HOSTED_PRO_PRICE_LABEL } from "@/lib/billing/plans";

export type DeploymentMode = "self_hosted" | "hosted";

export { HOSTED_PRO_PRICE_LABEL };

function parseFlag(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

/**
 * Optional `env` override is for unit tests only. Production / client code
 * must call with no args so Next can inline the literals.
 */
export function isHostedDeployment(
  env?: Record<string, string | undefined>
): boolean {
  const raw = env
    ? env.NEXT_PUBLIC_HOSTED
    : process.env.NEXT_PUBLIC_HOSTED;
  return parseFlag(raw) === true;
}

/**
 * Whether signup requires a beta code (UI field + API validation).
 * - NEXT_PUBLIC_BETA_ONLY=true/false wins when set
 * - otherwise falls back to hosted (invite-only while beta lasts)
 */
export function requiresBetaCode(
  env?: Record<string, string | undefined>
): boolean {
  const raw = env
    ? env.NEXT_PUBLIC_BETA_ONLY
    : process.env.NEXT_PUBLIC_BETA_ONLY;
  const explicit = parseFlag(raw);
  if (explicit !== undefined) return explicit;
  return isHostedDeployment(env);
}

export function getDeploymentMode(
  env?: Record<string, string | undefined>
): DeploymentMode {
  return isHostedDeployment(env) ? "hosted" : "self_hosted";
}
