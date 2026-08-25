import { validateExpiresAt } from '../../../src/transaction/ExpiresAt.js';

describe('validateExpiresAt', () => {
  it('passes through a deadline the wire format can carry', () => {
    expect(validateExpiresAt(1755000000n)).toEqual(1755000000n);
    expect(validateExpiresAt(1n)).toEqual(1n);
    expect(validateExpiresAt(2n ** 64n - 1n)).toEqual(2n ** 64n - 1n);
  });

  it('passes through the absent deadline the service assigns for', () => {
    expect(validateExpiresAt(null)).toBeNull();
  });

  it('rejects a deadline that cannot be encoded as an unsigned integer', () => {
    expect(() => validateExpiresAt(-1n)).toThrow('Request deadline must be a positive number of Unix seconds, got -1.');
  });

  // Zero encodes fine, which is why it used to slip through: it produces a
  // request that is expired by construction, because the deadline is exclusive
  // and every reference time is at or past it.
  it('rejects a deadline of zero', () => {
    expect(() => validateExpiresAt(0n)).toThrow('Request deadline must be a positive number of Unix seconds, got 0.');
  });

  it('rejects a deadline wider than CBOR can carry', () => {
    expect(() => validateExpiresAt(2n ** 64n)).toThrow(
      'Request deadline 18446744073709551616 exceeds the largest encodable value 18446744073709551615.',
    );
  });
});
