/**
 * Exclusive request deadline for tests: an hour ahead of the current wall clock,
 * so no test run can reach it while a request is in flight.
 *
 * @returns {bigint} Deadline in Unix seconds.
 */
export function expiresAt(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + 3600n;
}

/**
 * A deadline that has already passed, for exercising the expiry path.
 *
 * @returns {bigint} Deadline in Unix seconds.
 */
export function expiredExpiresAt(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) - 3600n;
}
