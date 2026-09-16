import { describe, expect, it } from 'vitest';
import { challengeFor, createVerifier } from './pkce';

describe('challengeFor', () => {
  it('matches the RFC 7636 appendix B known vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    await expect(challengeFor(verifier)).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('createVerifier', () => {
  it('is within RFC 7636 length bounds and uses only unreserved characters', () => {
    const verifier = createVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('is different across calls', () => {
    expect(createVerifier()).not.toBe(createVerifier());
  });
});
