import { describe, it, expect } from 'vitest';
import { hashBuffer, hashString } from '../../lib/hashing.js';

describe('hashing', () => {
  it('hashBuffer returns deterministic 64-char hex', () => {
    const buf = Buffer.from('hello');
    const h1 = hashBuffer(buf);
    const h2 = hashBuffer(buf);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashString returns known SHA-256 for "hello"', () => {
    const expected = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
    expect(hashString('hello')).toBe(expected);
  });

  it('different inputs produce different hashes', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
    expect(hashBuffer(Buffer.from('a'))).not.toBe(hashBuffer(Buffer.from('b')));
  });

  it('hashBuffer and hashString agree for same content', () => {
    const text = 'test content';
    expect(hashBuffer(Buffer.from(text))).toBe(hashString(text));
  });
});
