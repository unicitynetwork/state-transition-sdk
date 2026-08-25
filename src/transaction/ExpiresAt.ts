import { CborError } from '../serialization/cbor/CborError.js';

/**
 * Largest value CBOR can carry as an unsigned long, and therefore the largest
 * deadline that can be encoded at all.
 */
const MAX_EXPIRES_AT = 2n ** 64n - 1n;

/**
 * Validate an exclusive request deadline at the boundary that accepts it.
 *
 * Without this the range errors surface much later and far from the mistake:
 * a negative or oversized value encodes nowhere and fails inside
 * {@link CborSerializer} while the transaction hash is being computed, and `0n`
 * encodes fine but produces a request that is expired by construction, since
 * every reference time is at or past it.
 *
 * @param {bigint|null} expiresAt Deadline in Unix seconds, or `null` to let the service assign one.
 * @returns {bigint|null} The validated deadline, unchanged.
 * @throws {CborError} If the deadline cannot be encoded or is already unusable.
 */
export function validateExpiresAt(expiresAt: bigint | null): bigint | null {
  if (expiresAt === null) {
    return null;
  }

  if (expiresAt <= 0n) {
    throw new CborError(`Request deadline must be a positive number of Unix seconds, got ${expiresAt}.`);
  }

  if (expiresAt > MAX_EXPIRES_AT) {
    throw new CborError(`Request deadline ${expiresAt} exceeds the largest encodable value ${MAX_EXPIRES_AT}.`);
  }

  return expiresAt;
}
