import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { SparseMerkleTree } from '@unicitylabs/commons/lib/smt/SparseMerkleTree.js';

import { DirectAddress } from '../../../src/address/DirectAddress.js';
import { MaskedPredicate } from '../../../src/predicate/MaskedPredicate.js';
import { PredicateFactory } from '../../../src/predicate/PredicateFactory.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { TokenFactory } from '../../../src/token/TokenFactory.js';
import { TokenState } from '../../../src/token/TokenState.js';
import { ITransactionJson, Transaction } from '../../../src/transaction/Transaction.js';
import { ITransactionDataJson } from '../../../src/transaction/TransactionData.js';
import { createMintData, mintToken, sendToken } from '../../MintTokenUtils.js';
import { TestTokenData } from '../../TestTokenData.js';
import { TestAggregatorClient } from '../TestAggregatorClient.js';

const initialOwnerSecret = new TextEncoder().encode('secret');
const receiverSecret = new TextEncoder().encode('tere');

describe('Transition', function () {
  it('should verify the token latest state', async () => {
    const client = new StateTransitionClient(new TestAggregatorClient(new SparseMerkleTree(HashAlgorithm.SHA256)));
    const data = await createMintData(initialOwnerSecret);
    const token = await mintToken(client, data);
    await expect(DirectAddress.create(data.predicate.reference)).resolves.toEqual(
      await DirectAddress.fromJSON(token.transactions[0].data.recipient),
    );

    // Recipient prepares the info for the transfer
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const signingservice = await SigningService.createFromSecret(receiverSecret, nonce);
    const recipientPredicate = await MaskedPredicate.create(
      token.id,
      token.type,
      signingservice,
      HashAlgorithm.SHA256,
      nonce,
    );

    // Create transfer transaction
    const transaction = await sendToken(
      client,
      token,
      await SigningService.createFromSecret(initialOwnerSecret, data.nonce),
      await DirectAddress.create(recipientPredicate.reference),
    );

    const tokenFactory = new TokenFactory(new PredicateFactory());

    // Recipient imports token
    const importedToken = await tokenFactory.create(token.toJSON(), TestTokenData.fromJSON);
    // Recipient gets transaction from sender
    const importedTransaction = await Transaction.fromJSON(
      importedToken.id,
      importedToken.type,
      transaction.toJSON() as ITransactionJson<ITransactionDataJson>,
      new PredicateFactory(),
    );

    // Finish the transaction with the recipient predicate
    const updateToken = await client.finishTransaction(
      importedToken,
      await TokenState.create(recipientPredicate, new TextEncoder().encode('my custom data')),
      importedTransaction,
    );

    const signingService = await SigningService.createFromSecret(receiverSecret, token.state.unlockPredicate.nonce);
    expect(importedToken.state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();
    expect(updateToken.id).toEqual(token.id);
    expect(updateToken.type).toEqual(token.type);
    expect(updateToken.data.toJSON()).toEqual(token.data.toJSON());
    expect(updateToken.coins?.toJSON()).toEqual(token.coins?.toJSON());

    console.log(JSON.stringify(updateToken.toJSON()));
  }, 15000);
});
