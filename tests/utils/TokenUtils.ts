import { CertificationData } from '../../src/api/CertificationData.js';
import { CertificationStatus } from '../../src/api/CertificationResponse.js';
import { NetworkId } from '../../src/api/NetworkId.js';
import { SigningService } from '../../src/crypto/secp256k1/SigningService.js';
import { SignaturePredicateUnlockScript } from '../../src/predicate/builtin/SignaturePredicateUnlockScript.js';
import { IPredicate } from '../../src/predicate/IPredicate.js';
import { IUnlockScript } from '../../src/predicate/IUnlockScript.js';
import { ICborSerializable } from '../../src/serialization/cbor/ICborSerializable.js';
import { StateTransitionClient } from '../../src/StateTransitionClient.js';
import { MintTransaction } from '../../src/transaction/MintTransaction.js';
import { StateMask } from '../../src/transaction/StateMask.js';
import { Token } from '../../src/transaction/Token.js';
import { TokenSalt } from '../../src/transaction/TokenSalt.js';
import { TokenType } from '../../src/transaction/TokenType.js';
import { TransferTransaction } from '../../src/transaction/TransferTransaction.js';
import { IVerificationContext } from '../../src/transaction/verification/IVerificationContext.js';
import { waitInclusionProof } from '../../src/util/InclusionProofUtils.js';
import { VerificationStatus } from '../../src/verification/VerificationStatus.js';

export async function mintToken(
  client: StateTransitionClient,
  verificationContext: IVerificationContext,
  recipient: IPredicate,
  data: Uint8Array | null = null,
  networkId: NetworkId = NetworkId.LOCAL,
  tokenType: TokenType = TokenType.generate(),
  salt: TokenSalt = TokenSalt.generate(),
  justification: ICborSerializable | null = null,
  expiresAt: bigint | null = null,
): Promise<Token> {
  const transaction = await MintTransaction.create(networkId, recipient, {
    data: data,
    expiresAt: expiresAt,
    justification: justification?.toCBOR(),
    salt: salt,
    tokenType: tokenType,
  });

  const certificationData = await CertificationData.fromMintTransaction(transaction);

  const response = await client.submitCertificationRequest(certificationData);
  if (response.status !== String(CertificationStatus.SUCCESS)) {
    throw new Error(`Certification Request failed with status '${response.status}'`);
  }

  return Token.mint(
    await transaction.toCertifiedTransaction(
      verificationContext.trustBase,
      verificationContext.predicateVerifier,
      verificationContext.unicityCertificateVerifier,
      await waitInclusionProof(
        client,
        verificationContext.trustBase,
        verificationContext.predicateVerifier,
        verificationContext.unicityCertificateVerifier,
        transaction,
      ),
    ),
    verificationContext,
  );
}

export async function transferToken(
  client: StateTransitionClient,
  verificationContext: IVerificationContext,
  tokenBytes: Uint8Array,
  recipient: IPredicate,
  signingService: SigningService,
): Promise<Token> {
  const token = await Token.fromCBOR(tokenBytes);
  const result = await token.verify(verificationContext);

  if (result.status !== VerificationStatus.OK) {
    throw new Error(`Token verification failed: ${result.status}`);
  }

  const transaction = await TransferTransaction.create(token, recipient, StateMask.generate());

  return transferTokenWithTransaction(
    client,
    verificationContext,
    token,
    transaction,
    await SignaturePredicateUnlockScript.create(transaction, signingService),
  );
}

export async function transferTokenWithTransaction(
  client: StateTransitionClient,
  verificationContext: IVerificationContext,
  token: Token,
  transaction: TransferTransaction,
  unlockScript: IUnlockScript,
): Promise<Token> {
  const response = await client.submitCertificationRequest(
    await CertificationData.fromTransaction(transaction, unlockScript),
  );

  if (response.status !== String(CertificationStatus.SUCCESS)) {
    throw new Error(`Certification Request failed with status '${response.status}'`);
  }

  return token.transfer(
    await transaction.toCertifiedTransaction(
      verificationContext.trustBase,
      verificationContext.predicateVerifier,
      verificationContext.unicityCertificateVerifier,
      await waitInclusionProof(
        client,
        verificationContext.trustBase,
        verificationContext.predicateVerifier,
        verificationContext.unicityCertificateVerifier,
        transaction,
      ),
    ),
    verificationContext,
  );
}
