/**
 * Stop the stack {@link ./globalSetup.mjs} started.
 *
 * A stack the run did not start is left alone: it belongs to whoever set
 * AGGREGATOR_URL, and stopping it would break the next run.
 *
 * @returns {Promise<void>} Resolves once the stack is down.
 */
export default async function globalTeardown() {
  await globalThis.__AGGREGATOR_STACK__?.stop();
}
