// PKCE (RFC 7636) helpers for the lichess OAuth flow (see auth.ts). lichess registers no
// clients — any client_id is accepted — but still requires PKCE with S256, so this module
// derives the verifier/challenge pair using only Web Crypto (available as a global in both the
// browser and this Node test runtime; no dependency).
const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
// RFC 7636 allows 43-128 characters; 64 is a comfortable, fixed middle value.
const VERIFIER_LENGTH = 64;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A fresh, random code_verifier: 64 characters from RFC 7636's unreserved character set. */
export function createVerifier(): string {
  const bytes = new Uint8Array(VERIFIER_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += UNRESERVED[byte % UNRESERVED.length];
  return out;
}

/** The S256 code_challenge for a verifier: BASE64URL(SHA256(verifier)), no padding. */
export async function challengeFor(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(digest));
}
