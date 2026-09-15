import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { deleteLocalDocs, listLocalDocs } from "@/lib/db/indexed";
import {
  deriveDedupeKey,
  deriveKek,
  encryptVerifier,
  generateDekBytes,
  generateSalt,
  importDekForUse,
  kdfNeedsUpgrade,
  kdfParamsFromRow,
  unwrapDek,
  VAULT_KDF,
  VAULT_NAME_PLACEHOLDER,
  VAULT_PBKDF2_ITERATIONS,
  verifyDek,
  wrapDek,
} from "@/lib/vault/crypto";
import {
  createVaultRemote,
  fetchUserVault,
  updateVaultWraps,
  type UserVaultRow,
} from "@/lib/vault/api";
import {
  generateRecoveryCode,
  recoverySecretFromCode,
} from "@/lib/vault/recovery";
import { loadVaultIdleLock, vaultIdleLockMs } from "@/lib/vault/prefs";
import {
  loadCachedWorkspaceTree,
  saveCachedWorkspaceTree,
} from "@/lib/workspace/treeCache";
import { isInVault } from "@/lib/vault/membership";
import { getPinWindows, closePopOut } from "@/lib/pins/pinStore";
import type { WorkspaceNode } from "@/lib/workspace/types";

export class VaultLockedError extends Error {
  constructor(message = "Unlock the vault first.") {
    super(message);
    this.name = "VaultLockedError";
  }
}

export class VaultPassphraseError extends Error {
  constructor(message = "That passphrase did not unlock the vault.") {
    super(message);
    this.name = "VaultPassphraseError";
  }
}

export type VaultKeys = {
  dek: CryptoKey;
  hmacKey: CryptoKey;
  /** Empty after an IndexedDB restore — wrapping operations need a fresh unlock. */
  dekBytes: Uint8Array;
  nodeId: string;
};

type Listener = () => void;

interface VaultKeyDB extends DBSchema {
  session: {
    key: string;
    value: {
      id: string;
      nodeId: string;
      dek: CryptoKey;
      hmacKey: CryptoKey;
    };
  };
}

const VAULT_DB = "blogide-vault";
const SESSION_ID = "current";

let keys: VaultKeys | null = null;
const listeners = new Set<Listener>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleHandler: (() => void) | null = null;
let dbPromise: Promise<IDBPDatabase<VaultKeyDB>> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function getKeyDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available");
  }
  if (!dbPromise) {
    dbPromise = openDB<VaultKeyDB>(VAULT_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("session")) {
          db.createObjectStore("session", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export function subscribeVaultSession(listener: Listener): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function isVaultUnlocked(): boolean {
  return keys != null;
}

export function getVaultKeys(): VaultKeys | null {
  return keys;
}

export function requireVaultKeys(): VaultKeys {
  if (!keys) throw new VaultLockedError();
  return keys;
}

function setKeys(next: VaultKeys | null) {
  keys = next;
  emit();
}

async function persistKeys(next: VaultKeys, persist: boolean): Promise<void> {
  try {
    const db = await getKeyDb();
    if (!persist) {
      await db.delete("session", SESSION_ID);
      return;
    }
    await db.put("session", {
      id: SESSION_ID,
      nodeId: next.nodeId,
      dek: next.dek,
      hmacKey: next.hmacKey,
    });
  } catch {
    // Private mode / structured clone — in-memory session still works.
  }
}

async function dropPersistedKeys(): Promise<void> {
  try {
    const db = await getKeyDb();
    await db.delete("session", SESSION_ID);
  } catch {
    // ignore
  }
}

async function activate(
  dekBytes: Uint8Array,
  nodeId: string,
  persist: boolean
): Promise<VaultKeys> {
  const dek = await importDekForUse(dekBytes);
  const hmacKey = await deriveDedupeKey(dekBytes);
  const next: VaultKeys = { dek, hmacKey, dekBytes, nodeId };
  setKeys(next);
  await persistKeys(next, persist);
  markVaultActivity();
  return next;
}

export async function tryRestoreVaultSession(): Promise<boolean> {
  if (keys) return true;
  try {
    const db = await getKeyDb();
    const row = await db.get("session", SESSION_ID);
    if (!row?.dek || !row.hmacKey) return false;
    setKeys({
      dek: row.dek,
      hmacKey: row.hmacKey,
      dekBytes: new Uint8Array(),
      nodeId: row.nodeId,
    });
    markVaultActivity();
    return true;
  } catch {
    return false;
  }
}

async function unlockFromSecret(
  row: UserVaultRow,
  secret: string,
  wrapped: Uint8Array,
  salt: Uint8Array,
  persist: boolean
): Promise<VaultKeys> {
  const params = kdfParamsFromRow(row.kdf_params);
  const kek = await deriveKek(secret, salt, params.iterations);
  let dekBytes: Uint8Array;
  try {
    dekBytes = await unwrapDek(kek, wrapped);
  } catch {
    throw new VaultPassphraseError();
  }
  const dek = await importDekForUse(dekBytes);
  const ok = await verifyDek(dek, row.verifier);
  if (!ok) throw new VaultPassphraseError();
  const session = await activate(dekBytes, row.node_id, persist);
  if (kdfNeedsUpgrade(row.kdf, params)) {
    const saltPass = await generateSalt();
    const nextKek = await deriveKek(secret, saltPass);
    await updateVaultWraps({
      dekWrappedPass: await wrapDek(nextKek, dekBytes),
      saltPass,
      kdf: VAULT_KDF,
      kdfParams: { iterations: VAULT_PBKDF2_ITERATIONS },
    });
  }
  return session;
}

export async function unlockWithPassphrase(
  row: UserVaultRow,
  passphrase: string,
  persist: boolean
): Promise<VaultKeys> {
  return unlockFromSecret(
    row,
    passphrase,
    row.dek_wrapped_pass,
    row.salt_pass,
    persist
  );
}

export async function unlockWithRecovery(
  row: UserVaultRow,
  recoveryCode: string,
  persist: boolean
): Promise<VaultKeys> {
  const secret = recoverySecretFromCode(recoveryCode);
  return unlockFromSecret(
    row,
    secret,
    row.dek_wrapped_recovery,
    row.salt_recovery,
    persist
  );
}

export async function createVault(input: {
  passphrase: string;
  persist: boolean;
}): Promise<{ keys: VaultKeys; recoveryCode: string }> {
  const dekBytes = await generateDekBytes();
  const saltPass = await generateSalt();
  const { code } = generateRecoveryCode();
  const saltRecovery = await generateSalt();
  const kekPass = await deriveKek(input.passphrase, saltPass);
  const kekRec = await deriveKek(recoverySecretFromCode(code), saltRecovery);
  const dek = await importDekForUse(dekBytes);
  const result = await createVaultRemote({
    dekWrappedPass: await wrapDek(kekPass, dekBytes),
    saltPass,
    dekWrappedRecovery: await wrapDek(kekRec, dekBytes),
    saltRecovery,
    verifier: await encryptVerifier(dek),
    kdf: VAULT_KDF,
    kdfParams: { iterations: VAULT_PBKDF2_ITERATIONS },
  });
  if (!result.ok) {
    const reason =
      result.reason === "exists"
        ? "This account already has a vault."
        : "Could not create the vault.";
    throw new Error(reason);
  }
  const session = await activate(dekBytes, result.nodeId, input.persist);
  return { keys: session, recoveryCode: code };
}

export async function changeVaultPassphrase(passphrase: string): Promise<void> {
  const session = requireVaultKeys();
  if (!session.dekBytes.byteLength) {
    throw new Error("Unlock with your passphrase on this device to change it.");
  }
  const saltPass = await generateSalt();
  const kek = await deriveKek(passphrase, saltPass);
  await updateVaultWraps({
    dekWrappedPass: await wrapDek(kek, session.dekBytes),
    saltPass,
    kdf: VAULT_KDF,
    kdfParams: { iterations: VAULT_PBKDF2_ITERATIONS },
  });
}

export async function regenerateVaultRecovery(): Promise<string> {
  const session = requireVaultKeys();
  if (!session.dekBytes.byteLength) {
    throw new Error(
      "Unlock with your passphrase on this device to make a new recovery code."
    );
  }
  const row = await fetchUserVault();
  if (!row) throw new Error("Vault is missing.");
  const { code } = generateRecoveryCode();
  const saltRecovery = await generateSalt();
  const kek = await deriveKek(recoverySecretFromCode(code), saltRecovery);
  await updateVaultWraps({
    dekWrappedPass: row.dek_wrapped_pass,
    saltPass: row.salt_pass,
    dekWrappedRecovery: await wrapDek(kek, session.dekBytes),
    saltRecovery,
  });
  return code;
}

export async function vaultHasUnsyncedEdits(
  vaultNodeIds: Iterable<string>
): Promise<boolean> {
  const ids = new Set(vaultNodeIds);
  const docs = await listLocalDocs();
  return docs.some((doc) => ids.has(doc.nodeId) && doc.dirty);
}

export type LockVaultInput = {
  nodes: WorkspaceNode[];
  email?: string | null;
  clearTitles?: (ids: Iterable<string>) => void;
};

export async function lockVaultNow(input: LockVaultInput): Promise<void> {
  const vaultId = keys?.nodeId ?? input.nodes.find((n) => n.system_key === "vault")?.id;
  const vaultIds = input.nodes
    .filter((n) => vaultId && isInVault(n.id, input.nodes, vaultId))
    .map((n) => n.id);
  if (await vaultHasUnsyncedEdits(vaultIds)) {
    throw new Error("Save vault essays before locking — unsaved edits would be dropped.");
  }
  await deleteLocalDocs(vaultIds.filter((id) => {
    const node = input.nodes.find((n) => n.id === id);
    return node?.kind === "document";
  }));
  for (const pin of getPinWindows()) {
    if (pin.kind === "document" && vaultIds.includes(pin.nodeId)) {
      closePopOut(pin.nodeId);
    }
  }
  input.clearTitles?.(vaultIds);
  if (input.email) {
    const cached = loadCachedWorkspaceTree(input.email);
    if (cached) {
      const scrubbed = cached.nodes.map((node) =>
        vaultIds.includes(node.id) && node.system_key !== "vault"
          ? {
              ...node,
              name: VAULT_NAME_PLACEHOLDER,
              url: node.kind === "link" ? null : node.url,
            }
          : node
      );
      saveCachedWorkspaceTree(input.email, scrubbed, cached.scratchpadId);
    }
  }
  stopVaultIdleWatch();
  setKeys(null);
  await dropPersistedKeys();
}

export function markVaultActivity(): void {
  if (!keys) return;
  const ms = vaultIdleLockMs(loadVaultIdleLock());
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (ms == null || !idleHandler) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    idleHandler?.();
  }, ms);
}

export function startVaultIdleWatch(onIdle: () => void): () => void {
  idleHandler = onIdle;
  markVaultActivity();
  return () => {
    if (idleHandler === onIdle) idleHandler = null;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
}

export function stopVaultIdleWatch(): void {
  idleHandler = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}
