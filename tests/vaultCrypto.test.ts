import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeEnvelope,
  decryptBytes,
  decryptUtf8,
  encodeEnvelope,
  encryptBytes,
  encryptUtf8,
  encryptVerifier,
  importAesKey,
  unwrapDek,
  VAULT_DEK_LEN,
  VAULT_ENVELOPE_OVERHEAD,
  VAULT_IV_LEN,
  VAULT_TAG_LEN,
  VAULT_VERIFIER_PLAINTEXT,
  verifyDek,
  wrapDek,
} from "@/lib/vault/crypto";
import { formatRecoveryCode, generateRecoveryCode, recoverySecretFromCode } from "@/lib/vault/recovery";

describe("vault envelope", () => {
  it("round-trips UTF-8 with WebCrypto AES-256-GCM", async () => {
    const raw = randomBytes(VAULT_DEK_LEN);
    const key = await importAesKey(new Uint8Array(raw), false);
    const blob = await encryptUtf8(key, "hello vault");
    expect(blob.byteLength).toBeGreaterThan(VAULT_ENVELOPE_OVERHEAD);
    expect(await decryptUtf8(key, blob)).toBe("hello vault");
  });

  it("matches node:crypto AES-256-GCM layout", async () => {
    const key = randomBytes(VAULT_DEK_LEN);
    const iv = randomBytes(VAULT_IV_LEN);
    const plain = Buffer.from("interop-plain", "utf8");
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = encodeEnvelope(
      new Uint8Array(iv),
      new Uint8Array(tag),
      new Uint8Array(ciphertext)
    );
    const decoded = decodeEnvelope(envelope);
    expect(decoded.iv.byteLength).toBe(VAULT_IV_LEN);
    expect(decoded.tag.byteLength).toBe(VAULT_TAG_LEN);

    const webKey = await importAesKey(new Uint8Array(key), false);
    expect(Buffer.from(await decryptBytes(webKey, envelope)).toString("utf8")).toBe(
      "interop-plain"
    );

    const webBlob = await encryptBytes(webKey, new Uint8Array(plain), new Uint8Array(iv));
    const web = decodeEnvelope(webBlob);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(web.iv));
    decipher.setAuthTag(Buffer.from(web.tag));
    const out = Buffer.concat([
      decipher.update(Buffer.from(web.ciphertext)),
      decipher.final(),
    ]);
    expect(out.toString("utf8")).toBe("interop-plain");
  });

  it("wraps and unwraps a DEK, and checks the verifier", async () => {
    const dekBytes = new Uint8Array(randomBytes(VAULT_DEK_LEN));
    const kekBytes = new Uint8Array(randomBytes(VAULT_DEK_LEN));
    const kek = await importAesKey(kekBytes, false);
    const wrapped = await wrapDek(kek, dekBytes);
    const unwrapped = await unwrapDek(kek, wrapped);
    expect([...unwrapped]).toEqual([...dekBytes]);
    const dek = await importAesKey(dekBytes, false);
    const verifier = await encryptVerifier(dek);
    expect(await verifyDek(dek, verifier)).toBe(true);
    const other = await importAesKey(new Uint8Array(randomBytes(VAULT_DEK_LEN)), false);
    expect(await verifyDek(other, verifier)).toBe(false);
    expect(await decryptUtf8(dek, verifier)).toBe(VAULT_VERIFIER_PLAINTEXT);
  });
});

describe("recovery code", () => {
  it("normalizes grouped base32", () => {
    const { code } = generateRecoveryCode();
    const formatted = formatRecoveryCode(code);
    expect(formatted).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4})+$/);
    const secret = recoverySecretFromCode(formatted.toLowerCase());
    expect(secret.length).toBeGreaterThan(0);
    expect(recoverySecretFromCode(code.replace(/-/g, ""))).toBe(secret);
  });
});
