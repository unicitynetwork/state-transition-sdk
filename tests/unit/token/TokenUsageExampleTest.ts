import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';

import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { testTransferFlow, testSplitFlow } from '../../token/CommonTestFlow.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';

describe('Transition', function () {
  const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));

  it('should verify the token latest state', async () => {
    await testTransferFlow(client);
  }, 15000);

  it('should split tokens', async () => {
    await testSplitFlow(client);
  }, 15000);
});
