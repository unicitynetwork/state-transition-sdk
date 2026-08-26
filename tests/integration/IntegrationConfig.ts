import { readFileSync } from 'node:fs';

import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';

/**
 * Read a value the stack published, or say why it is missing.
 *
 * Both are set by tests/integration/support/globalSetup.mjs once the stack it
 * started is certifying. Their absence means this suite was run without
 * jest.integration.config.js, so no stack exists to talk to.
 *
 * @param {string} name Environment variable to read.
 * @returns {string} Its value.
 * @throws {Error} If the variable is unset.
 */
function fromStack(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is unset. Run the integration suite with \`npm run test:integration\`.`);
  }

  return value;
}

/**
 * Build the client and trust base the integration suite runs against.
 *
 * The endpoint and trust base come from the stack Testcontainers started for
 * this run — a fresh chain, and a trust base its BFT root node generated at
 * genesis. Nothing here is configurable: a run that could be pointed elsewhere
 * would not be testing the compose file it exists to exercise, and pointing the
 * SDK at a deployed network is what the e2e suite does.
 *
 * @returns {object} Aggregator client, state transition client and trust base for this run's stack.
 */
export function createIntegrationContext(): {
  aggregatorClient: IAggregatorClient;
  client: StateTransitionClient;
  trustBase: RootTrustBase;
} {
  const aggregatorClient = new AggregatorClient(fromStack('AGGREGATOR_URL'), null);

  return {
    aggregatorClient,
    client: new StateTransitionClient(aggregatorClient),
    trustBase: RootTrustBase.fromJSON(JSON.parse(readFileSync(fromStack('TRUST_BASE_PATH'), 'utf-8'))),
  };
}
