import { createIntegrationContext } from './IntegrationConfig.js';
import { transitionFlowTest } from '../utils/TransitionFlow.js';

describe('Integration TransitionFlow', () => {
  const { client, trustBase } = createIntegrationContext();

  transitionFlowTest(client, trustBase);
});
