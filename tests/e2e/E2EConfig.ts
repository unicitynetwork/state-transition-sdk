import { readFileSync } from 'node:fs';

import defaultTrustBaseJson from './trust-base.json' with { type: 'json' };
import { AggregatorClient } from '../../src/api/AggregatorClient.js';
import { RootTrustBase } from '../../src/api/bft/RootTrustBase.js';
import { IAggregatorClient } from '../../src/api/IAggregatorClient.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';

/**
 * Aggregator endpoint under test. Defaults to a local aggregator; point
 * `AGGREGATOR_URL` at a real network (together with `TRUST_BASE_PATH` and,
 * when the endpoint requires one, `AGGREGATOR_API_KEY`) to run against it.
 */
export const AGGREGATOR_URL = process.env.AGGREGATOR_URL ?? 'http://localhost:3000';

/**
 * Build the client and trust base the e2e suite runs against.
 *
 * @returns {object} Aggregator client, state transition client and trust base for the configured endpoint.
 */
export function createE2EContext(): {
  aggregatorClient: IAggregatorClient;
  client: StateTransitionClient;
  trustBase: RootTrustBase;
} {
  const aggregatorClient = new AggregatorClient(AGGREGATOR_URL, process.env.AGGREGATOR_API_KEY ?? null);
  const trustBasePath = process.env.TRUST_BASE_PATH ?? null;

  return {
    aggregatorClient,
    client: new StateTransitionClient(aggregatorClient),
    trustBase: RootTrustBase.fromJSON(
      trustBasePath ? JSON.parse(readFileSync(trustBasePath, 'utf-8')) : defaultTrustBaseJson,
    ),
  };
}
