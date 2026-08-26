import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DockerComposeEnvironment, Wait } from 'testcontainers';

const COMPOSE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docker');
const DATA_DIR = path.join(COMPOSE_DIR, 'data');
const TRUST_BASE_PATH = path.join(DATA_DIR, 'genesis', 'trust-base.json');

/** The aggregator's own port inside the container; the host port is ephemeral. */
const AGGREGATOR_PORT = 3000;
/** Genesis, a replica-set election and the first certified round, on a cold start. */
const STARTUP_TIMEOUT_MS = 240000;

/**
 * Ask the aggregator for its block height.
 *
 * @param {string} url Aggregator base URL.
 * @returns {Promise<bigint|null>} Height, or null if it cannot be read yet.
 */
async function blockHeight(url) {
  try {
    const response = await fetch(url, {
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'get_block_height', params: {} }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    const { result } = await response.json();
    return result?.blockNumber != null ? BigInt(result.blockNumber) : null;
  } catch {
    return null;
  }
}

/**
 * Block until consensus is certifying rounds.
 *
 * A healthy aggregator is not a usable one: until consensus hands it a
 * reference time it answers every certification request with
 * SERVICE_NOT_READY, so the tests would fail on a service that is merely
 * still starting.
 *
 * @param {string} url Aggregator base URL.
 * @returns {Promise<void>} Resolves once a block has been certified.
 * @throws {Error} If no block is certified before the startup timeout.
 */
async function waitForCertification(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const height = await blockHeight(url);
    if (height != null && height > 0n) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Aggregator at ${url} did not certify a block within ${STARTUP_TIMEOUT_MS}ms.`);
}

/**
 * Start the aggregator stack the integration suite runs against.
 *
 * A caller that has already started one — `npm run integration:up`, or a shared
 * service in some other environment — sets AGGREGATOR_URL, and this reuses it
 * rather than starting a second. That keeps the edit-run loop fast: the stack
 * takes the better part of a minute to reach its first certified round, and
 * there is no reason to pay that per run while iterating on a test.
 *
 * @returns {Promise<{stop: () => Promise<void>, trustBasePath: string, url: string}>} The running stack.
 */
export async function startAggregatorStack() {
  if (process.env.AGGREGATOR_URL) {
    const url = process.env.AGGREGATOR_URL;
    await waitForCertification(url);

    return {
      stop: () => Promise.resolve(),
      trustBasePath: process.env.TRUST_BASE_PATH ?? TRUST_BASE_PATH,
      url,
    };
  }

  // Genesis is bind-mounted and survives a container teardown. Reusing it
  // against the fresh mongodb and redis volumes below would pair a chain that
  // remembers nothing with a root node that remembers everything.
  await rm(DATA_DIR, { force: true, recursive: true });
  await mkdir(path.join(DATA_DIR, 'genesis'), { recursive: true });
  await mkdir(path.join(DATA_DIR, 'genesis-root'), { recursive: true });

  const environment = await new DockerComposeEnvironment(COMPOSE_DIR, 'docker-compose.yml')
    .withEnvironment({
      // Port 0 publishes on an ephemeral host port, so concurrent runs and CI
      // jobs cannot collide on a fixed one.
      AGGREGATOR_PORT: '0',
      USER_GID: String(process.getgid?.() ?? 1001),
      USER_UID: String(process.getuid?.() ?? 1001),
    })
    .withWaitStrategy(
      'aggregator-1',
      Wait.forHttp('/health', AGGREGATOR_PORT).forStatusCode(200).withStartupTimeout(STARTUP_TIMEOUT_MS),
    )
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .up();

  const aggregator = environment.getContainer('aggregator-1');
  const url = `http://${aggregator.getHost()}:${aggregator.getMappedPort(AGGREGATOR_PORT)}`;
  await waitForCertification(url);

  return {
    stop: async () => {
      await environment.down({ removeVolumes: true });
      await rm(DATA_DIR, { force: true, recursive: true });
    },
    trustBasePath: TRUST_BASE_PATH,
    url,
  };
}
