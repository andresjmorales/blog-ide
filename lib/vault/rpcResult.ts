export type CreateVaultResult =
  | { ok: true; nodeId: string }
  | { ok: false; reason: "exists" | string };

export function parseCreateVaultResult(data: unknown): CreateVaultResult {
  let row: unknown = data;
  if (typeof row === "string") {
    try {
      row = JSON.parse(row) as unknown;
    } catch {
      throw new Error("Could not create the vault.");
    }
  }
  if (!row || typeof row !== "object") {
    throw new Error("Could not create the vault.");
  }
  const rec = row as { ok?: unknown; nodeId?: unknown; reason?: unknown };
  if (rec.ok === true && rec.nodeId != null && String(rec.nodeId)) {
    return { ok: true, nodeId: String(rec.nodeId) };
  }
  if (rec.ok === false) {
    return {
      ok: false,
      reason: rec.reason === "exists" ? "exists" : String(rec.reason ?? "error"),
    };
  }
  throw new Error("Could not create the vault.");
}

export function isRetryableVaultRpcError(error: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "PGRST002" ||
    message.includes("schema cache") ||
    (message.includes("could not find") && message.includes("function"))
  );
}
