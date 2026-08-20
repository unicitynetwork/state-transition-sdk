/**
 * Exclusive certification request timeout for tests: an hour ahead of the
 * current wall clock, so no test run can reach it while it is in flight.
 *
 * @returns {bigint} Request timeout in Unix seconds.
 */
export function requestTimeout(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + 3600n;
}

/**
 * A timeout that has already passed, for exercising the expiry path.
 *
 * @returns {bigint} Request timeout in Unix seconds.
 */
export function expiredRequestTimeout(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) - 3600n;
}
