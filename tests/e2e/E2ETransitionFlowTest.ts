import { createE2EContext } from './E2EConfig.js';
import { transitionFlowTest } from '../utils/TransitionFlow.js';

describe('E2E TransitionFlow', () => {
  const { client, trustBase } = createE2EContext();

  transitionFlowTest(client, trustBase);
});
