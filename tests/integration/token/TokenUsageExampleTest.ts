import path from 'path';

import { InclusionProofVerificationStatus } from '@unicitylabs/commons/lib/api/InclusionProof.js';
import { HashAlgorithm } from '@unicitylabs/commons/lib/hash/HashAlgorithm.js';
import { SigningService } from '@unicitylabs/commons/lib/signing/SigningService.js';
import { DockerComposeEnvironment, StartedDockerComposeEnvironment, Wait } from 'testcontainers';

import { DirectAddress } from '../../../src/address/DirectAddress.js';
import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { MaskedPredicate } from '../../../src/predicate/MaskedPredicate.js';
import { PredicateFactory } from '../../../src/predicate/PredicateFactory.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { TokenFactory } from '../../../src/token/TokenFactory.js';
import { TokenState } from '../../../src/token/TokenState.js';
import { ITransactionJson, Transaction } from '../../../src/transaction/Transaction.js';
import { ITransactionDataJson } from '../../../src/transaction/TransactionData.js';
import { createMintData, mintToken, sendToken } from '../../MintTokenUtils.js';
import { TestTokenData } from '../../TestTokenData.js';

const textEncoder = new TextEncoder();
const initialOwnerSecret = new TextEncoder().encode('secret');
const receiverSecret = new TextEncoder().encode('tere');

const aggregatorPort = 3000; // the port defined in docker-compose.yml
const composeFileDir = path.resolve(__dirname, '../docker/aggregator/');

describe('Transition', function () {
  let dockerEnvironment: StartedDockerComposeEnvironment;
  let aggregatorUrl: string;

  beforeAll(async () => {
    // currently cannot use DockerComposeEnvironment to run multiple tests in parallel
    // as the only way to go from dockerEnvironment to container is by using dockerEnvironment.getContainer(containerName)
    // however, it requires the container name to specified in docker compose file, and docker does not allow to run
    // multiple containers with the same name
    console.log('running docker compose file: ' + path.join(composeFileDir, 'docker-compose.yml'));
    dockerEnvironment = await new DockerComposeEnvironment(composeFileDir, 'docker-compose.yml')
      .withWaitStrategy('aggregator-test', Wait.forLogMessage('listening on port ' + aggregatorPort))
      .up();

    const container = dockerEnvironment.getContainer('aggregator-test');
    const host = container.getHost();
    const port = container.getMappedPort(aggregatorPort);
    aggregatorUrl = `http://${host}:${port}`;
  }, 180000);

  afterAll(async () => {
    if (dockerEnvironment) {
      await dockerEnvironment.down();
    }
  }, 30000);

  it('should verify the token latest state', async () => {
    // Mint a new token where owner=initialOwnerSecret
    console.log('connecting to aggregator url: ' + aggregatorUrl);
    const client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
    const data = await createMintData(initialOwnerSecret);
    const token = await mintToken(client, data);

    // Verify that the token was created with the correct recipient address
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

    // Create transfer transaction from initial owner to the recipient's masked address
    const transaction = await sendToken(
      client,
      token,
      await SigningService.createFromSecret(initialOwnerSecret, data.nonce),
      await DirectAddress.create(recipientPredicate.reference),
    );

    // Recipient imports token
    const tokenFactory = new TokenFactory(new PredicateFactory());
    const importedToken = await tokenFactory.create(token.toJSON(), TestTokenData.fromJSON);

    // Recipient gets transaction from sender
    const importedTransaction = await Transaction.fromJSON(
      importedToken.id,
      importedToken.type,
      transaction.toJSON() as ITransactionJson<ITransactionDataJson>,
      new PredicateFactory(),
    );

    // Finalize the transaction using the recipient's predicate and update the token state
    const updatedToken = await client.finishTransaction(
      importedToken,
      await TokenState.create(recipientPredicate, textEncoder.encode('my custom data')),
      importedTransaction,
    );

    // Verify the updated token
    const signingService = await SigningService.createFromSecret(receiverSecret, token.state.unlockPredicate.nonce);
    expect(importedToken.state.unlockPredicate.isOwner(signingService.publicKey)).toBeTruthy();
    expect(updatedToken.id).toEqual(token.id);
    expect(updatedToken.type).toEqual(token.type);
    expect(updatedToken.data.toJSON()).toEqual(token.data.toJSON());
    expect(updatedToken.coins?.toJSON()).toEqual(token.coins?.toJSON());

    console.log(JSON.stringify(updatedToken.toJSON()));

    // Verify the original minted token has been spent
    const senderSigningService = await SigningService.createFromSecret(initialOwnerSecret, data.nonce);
    const mintedTokenStatus = await client.getTokenStatus(token, senderSigningService.publicKey);
    expect(mintedTokenStatus).toEqual(InclusionProofVerificationStatus.OK);

    // Verify the updated token has not been spent
    const transferredTokenStatus = await client.getTokenStatus(updatedToken, signingService.publicKey);
    expect(transferredTokenStatus).toEqual(InclusionProofVerificationStatus.PATH_NOT_INCLUDED);
  }, 30000);
});
