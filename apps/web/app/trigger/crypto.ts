/**
 * Crypto utilities for token encryption in Trigger.dev tasks
 *
 * Maintains same AES-GCM encryption standards as Cloudflare Workers version
 * Compatible with Node.js environment used by Trigger.dev
 */

// === Crypto Helpers for Token Encryption ===

export async function getKeyMaterial(
  secretKeyString: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  // For AES-GCM, key length can be 128, 192, or 256 bits.
  // We'll use SHA-256 to derive a 256-bit key from the secret string.
  // This ensures the key is always the correct length regardless of the secret string's length.
  const keyDataBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(secretKeyString),
  );
  return crypto.subtle.importKey(
    "raw",
    keyDataBuffer,
    { name: "AES-GCM" },
    false, // not extractable
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(
  token: string,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM standard IV size is 12 bytes
  const encodedToken = new TextEncoder().encode(token);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedToken,
  );

  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const encryptedHex = Array.from(new Uint8Array(encryptedBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${ivHex}:${encryptedHex}`;
}

export async function decryptToken(
  ivAndEncryptedToken: string,
  key: CryptoKey,
): Promise<string> {
  const [ivHex, encryptedHex] = ivAndEncryptedToken.split(":");
  if (!ivHex || !encryptedHex)
    throw new Error("Invalid encrypted token format for decryption");

  const iv = new Uint8Array(
    ivHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const encryptedBuffer = new Uint8Array(
    encryptedHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encryptedBuffer,
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Helper function to get encryption key from environment
 * Expected to be called within Trigger.dev tasks where process.env is available
 */
export async function getEncryptionKey(): Promise<CryptoKey> {
  const secretKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secretKey) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY environment variable is required for token encryption",
    );
  }
  return getKeyMaterial(secretKey);
}

/**
 * Convenience functions that automatically use environment encryption key
 */
export async function encryptTokenWithEnvKey(token: string): Promise<string> {
  const key = await getEncryptionKey();
  return encryptToken(token, key);
}

export async function decryptTokenWithEnvKey(
  encryptedToken: string,
): Promise<string> {
  const key = await getEncryptionKey();
  return decryptToken(encryptedToken, key);
}
