import { readFileSync } from 'node:fs';
import path from 'node:path';

import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';

/**
 * The aggregator stack in ./docker, started by scripts/integration-aggregator.sh.
 *
 * Unlike the e2e suite, which is pointed at a deployed network, this one owns
 * its service: the stack runs locally with no external dependency, and its
 * trust base is generated per run by the BFT root node it brings up. Both are
 * overridable, but the defaults are meant to need no setup beyond
 * `npm run integration:up`.
 */
export const AGGREGATOR_URL = process.env.AGGREGATOR_URL ?? 'http://localhost:3000';

/** Genesis the local stack writes on first start. */
const GENERATED_TRUST_BASE = path.join(__dirname, 'docker/data/genesis/trust-base.json');

/**
 * Build the client and trust base the integration suite runs against.
 *
 * @returns {object} Aggregator client, state transition client and trust base for the local stack.
 * @throws {Error} If the stack's genesis is missing, which means it was never started.
 */
export function createIntegrationContext(): {
  aggregatorClient: IAggregatorClient;
  client: StateTransitionClient;
  trustBase: RootTrustBase;
} {
  const trustBasePath = process.env.TRUST_BASE_PATH ?? GENERATED_TRUST_BASE;

  let trustBaseJson: string;
  try {
    trustBaseJson = readFileSync(trustBasePath, 'utf-8');
  } catch (cause) {
    throw new Error(
      `No trust base at ${trustBasePath}. Start the local aggregator stack with \`npm run integration:up\` first.`,
      { cause },
    );
  }

  const aggregatorClient = new AggregatorClient(AGGREGATOR_URL, process.env.AGGREGATOR_API_KEY ?? null);

  return {
    aggregatorClient,
    client: new StateTransitionClient(aggregatorClient),
    trustBase: RootTrustBase.fromJSON(JSON.parse(trustBaseJson)),
  };
}
