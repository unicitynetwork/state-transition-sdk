import base from './jest.config.js';

/**
 * Integration suite: the same transforms as the default config, plus the
 * aggregator stack the tests run against.
 *
 * It lives in its own config because globalSetup is per-run, and starting an
 * aggregator for the unit and functional suites — which have no service to talk
 * to — would put a docker dependency on the tests that are meant not to have
 * one. Coverage is off: these exercise wire compatibility, and the unit and
 * functional suites are what measure reach into src/.
 */
export default {
  ...base,
  collectCoverage: false,
  globalSetup: '<rootDir>/tests/integration/support/globalSetup.mjs',
  globalTeardown: '<rootDir>/tests/integration/support/globalTeardown.mjs',
  testMatch: ['<rootDir>/tests/integration/**/*Test.ts'],
};
