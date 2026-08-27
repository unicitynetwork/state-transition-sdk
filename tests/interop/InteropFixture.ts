import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicate } from '../../src/predicate/builtin/SignaturePredicate.js';
import { SignaturePredicateUnlockScript } from '../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { PredicateVerifierService } from '../../src/predicate/verification/PredicateVerifierService.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { StateMask } from '../../src/transaction/StateMask.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenSalt } from '../../src/transaction/TokenSalt.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { IVerificationContext } from '../../src/transaction/verification/IVerificationContext.js';
import { MintJustificationVerifierService } from '../../src/transaction/verification/MintJustificationVerifierService.js';
import { TokenIssuanceVerifierService } from '../../src/transaction/verification/TokenIssuanceVerifierService.js';
import { VerificationContext } from '../../src/transaction/verification/VerificationContext.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { TestAggregatorClient } from '../functional/TestAggregatorClient.js';
import { createUnicityCertificateVerifier } from '../utils/UnicityCertificateVerifierFixture.js';

/**
 * Shared constants and helpers for the cross-SDK interop vectors.
 *
 * Every input is fixed. A vector is only useful if regenerating it reproduces the same bytes, so
 * nothing here may read a clock or a random source: keys, salt, token type, state mask, the
 * request deadline and the aggregator's round clock are all constants, and both SDKs sign with
 * RFC 6979 deterministic ECDSA.
 */
export const REFERENCE_TIME = 1755000000n;
/** Deadline carried by every request in the vectors. An hour after the round clock. */
export const EXPIRES_AT = REFERENCE_TIME + 3600n;

/** Directory the committed vectors live in. */
export const VECTORS = path.join(__dirname, 'vectors');

const key = (last: number): Uint8Array => {
  const bytes = new Uint8Array(32);
  bytes[31] = last;

  return bytes;
};

/** Fixed 32-byte value, so salts and token types are reproducible. */
export const filled = (value: number): Uint8Array => new Uint8Array(32).fill(value);

export const AGGREGATOR_KEY = key(0x01);
export const ALICE_KEY = key(0x02);
export const BOB_KEY = key(0x03);

/**
 * Mint a token and transfer it once, entirely from fixed inputs.
 *
 * @returns {Promise<{token: Token, trustBaseJson: string}>} The token and the trust base to verify it under.
 */
export async function buildToken(): Promise<{ token: Token; trustBaseJson: string }> {
  const aggregator = TestAggregatorClient.create(AGGREGATOR_KEY);
  aggregator.setReferenceTime(REFERENCE_TIME);
  const client = new StateTransitionClient(aggregator);
  const trustBase = aggregator.rootTrustBase;
  const predicateVerifier = PredicateVerifierService.create();
  const unicityCertificateVerifier = createUnicityCertificateVerifier();
  const context: IVerificationContext = new VerificationContext(
    trustBase,
    predicateVerifier,
    unicityCertificateVerifier,
    new MintJustificationVerifierService(),
    new TokenIssuanceVerifierService(false),
  );

  const alice = new SigningService(ALICE_KEY);
  const bob = new SigningService(BOB_KEY);

  const mint = await MintTransaction.create(NetworkId.LOCAL, SignaturePredicate.fromSigningService(alice), {
    expiresAt: EXPIRES_AT,
    salt: TokenSalt.fromBytes(filled(0x22)),
    tokenType: new TokenType(filled(0x11)),
  });
  if (
    (await client.submitCertificationRequest(await CertificationData.fromMintTransaction(mint))).status !==
    String(CertificationStatus.SUCCESS)
  ) {
    throw new Error('mint was not certified');
  }
  const minted = await Token.mint(
    await mint.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, mint),
    ),
    context,
  );

  const transfer = await TransferTransaction.create(
    minted,
    SignaturePredicate.fromSigningService(bob),
    StateMask.fromBytes(filled(0x33)),
    { expiresAt: EXPIRES_AT },
  );
  const unlockScript = await SignaturePredicateUnlockScript.create(transfer, alice);
  if (
    (await client.submitCertificationRequest(await CertificationData.fromTransaction(transfer, unlockScript)))
      .status !== String(CertificationStatus.SUCCESS)
  ) {
    throw new Error('transfer was not certified');
  }
  const token = await minted.transfer(
    await transfer.toCertifiedTransaction(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      await waitInclusionProof(client, trustBase, predicateVerifier, unicityCertificateVerifier, transfer),
    ),
    context,
  );

  return { token, trustBaseJson: JSON.stringify(trustBase.toJSON()) };
}

/** Whether the run should overwrite the committed vectors instead of asserting against them. */
export const WRITING = process.env.INTEROP_WRITE === 'true';

export function readVector(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(VECTORS, name)));
}

export function readVectorText(name: string): string {
  return readFileSync(path.join(VECTORS, name), 'utf-8').trim();
}

export function writeVector(name: string, content: Uint8Array | string): void {
  mkdirSync(VECTORS, { recursive: true });
  writeFileSync(path.join(VECTORS, name), content);
}

export function hasVector(name: string): boolean {
  return existsSync(path.join(VECTORS, name));
}
