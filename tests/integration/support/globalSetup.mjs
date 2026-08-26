import { startAggregatorStack } from './aggregatorStack.mjs';

/**
 * Start the aggregator stack once for the whole integration run and publish
 * where it lives.
 *
 * The suites read AGGREGATOR_URL and TRUST_BASE_PATH; Jest copies the
 * environment into its workers, so setting them here is what reaches the tests.
 *
 * @returns {Promise<void>} Resolves once the stack is certifying.
 */
export default async function globalSetup() {
  const stack = await startAggregatorStack();

  // globalTeardown runs in this same process, so the handle can be passed
  // through globalThis; nothing else can reach it.
  globalThis.__AGGREGATOR_STACK__ = stack;
  process.env.AGGREGATOR_URL = stack.url;
  process.env.TRUST_BASE_PATH = stack.trustBasePath;
}
