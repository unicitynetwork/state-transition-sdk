import { ITransaction } from './ITransaction.js';
import { StateMask } from './StateMask.js';
import { TransferTransaction } from './TransferTransaction.js';
import { RootTrustBase } from '../api/bft/RootTrustBase.js';
import { UnicityCertificateVerifier } from '../api/bft/verification/UnicityCertificateVerifier.js';
import { InclusionProof } from '../api/InclusionProof.js';
import { DataHash } from '../crypto/hash/DataHash.js';
import { EncodedPredicate } from '../predicate/EncodedPredicate.js';
import { PredicateVerifierService } from '../predicate/verification/PredicateVerifierService.js';
import { CborDeserializer } from '../serialization/cbor/CborDeserializer.js';
import { CborSerializer } from '../serialization/cbor/CborSerializer.js';
import { dedent } from '../util/StringUtils.js';
import { VerificationError } from '../verification/VerificationError.js';
import {
  InclusionProofVerificationRule,
  InclusionProofVerificationStatus,
} from './verification/rule/InclusionProofVerificationRule.js';

/**
 * Transfer transaction bundled with a verified inclusion proof.
 */
export class CertifiedTransferTransaction implements ITransaction {
  private constructor(
    private readonly transaction: TransferTransaction,
    public readonly inclusionProof: InclusionProof,
  ) {}

  /**
   * @returns {Uint8Array|null} Data payload of the inner transaction.
   */
  public get data(): Uint8Array | null {
    return this.transaction.data;
  }

  /**
   * @returns {bigint|null} Exclusive request deadline of the inner transaction, in Unix seconds.
   */
  public get expiresAt(): bigint | null {
    return this.transaction.expiresAt;
  }

  /**
   * @returns {EncodedPredicate} Lock script of the inner transaction.
   */
  public get lockScript(): EncodedPredicate {
    return this.transaction.lockScript;
  }

  /**
   * @returns {EncodedPredicate} Recipient predicate of the inner transaction.
   */
  public get recipient(): EncodedPredicate {
    return this.transaction.recipient;
  }

  /**
   * @returns {bigint} Reference time of the round the leaf was created in, in Unix seconds.
   *
   * Read from the inclusion proof rather than stored beside it: the service
   * records the leaf's creation time on the record itself and serves that same
   * value for every proof of the leaf, and the leaf value binds it, so the
   * proof is the authenticated source for it.
   */
  public get referenceTime(): bigint {
    return this.inclusionProof.referenceTime;
  }

  /**
   * @returns {DataHash} Source state hash of the inner transaction.
   */
  public get sourceStateHash(): DataHash {
    return this.transaction.sourceStateHash;
  }

  /**
   * @returns {StateMask} State mask of the inner transaction.
   */
  public get stateMask(): StateMask {
    return this.transaction.stateMask;
  }

  /**
   * Create CertifiedTransferTransaction from CBOR bytes.
   *
   * @param {Uint8Array} bytes CBOR bytes.
   * @param {DataHash} sourceStateHash Hash of the state the transfer spends.
   * @param {EncodedPredicate} lockScript Lock script the transfer unlocks.
   * @returns {CertifiedTransferTransaction} Decoded certified transaction.
   */
  public static fromCBOR(
    bytes: Uint8Array,
    sourceStateHash: DataHash,
    lockScript: EncodedPredicate,
  ): CertifiedTransferTransaction {
    const data = CborDeserializer.decodeArray(bytes, 2);
    const proof = InclusionProof.fromCBOR(data[1]);
    return new CertifiedTransferTransaction(TransferTransaction.fromCBOR(data[0], sourceStateHash, lockScript), proof);
  }

  /**
   * Create CertifiedTransferTransaction from mint transaction and inclusion proof.
   *
   * @param {RootTrustBase} trustBase Root trust base used to verify the inclusion certificate.
   * @param {PredicateVerifierService} predicateVerifier Verifier for any embedded predicates.
   * @param {UnicityCertificateVerifier} unicityCertificateVerifier Unicity certificate verifier.
   * @param {TransferTransaction} transaction Transaction to certify.
   * @param {InclusionProof} inclusionProof Inclusion proof for the transaction.
   * @returns {Promise<CertifiedTransferTransaction>} Verified certified transaction.
   * @throws {VerificationError} If the inclusion proof does not verify.
   */
  public static async fromTransaction(
    trustBase: RootTrustBase,
    predicateVerifier: PredicateVerifierService,
    unicityCertificateVerifier: UnicityCertificateVerifier,
    transaction: TransferTransaction,
    inclusionProof: InclusionProof,
  ): Promise<CertifiedTransferTransaction> {
    const result = await InclusionProofVerificationRule.verify(
      trustBase,
      predicateVerifier,
      unicityCertificateVerifier,
      inclusionProof,
      await transaction.calculateTransactionHash(),
      transaction.expiresAt,
      transaction.lockScript,
      transaction.sourceStateHash,
    );
    if (result.status !== InclusionProofVerificationStatus.OK) {
      throw new VerificationError('Inclusion proof verification failed', result);
    }

    return new CertifiedTransferTransaction(transaction, inclusionProof);
  }

  /**
   * @inheritDoc
   */
  public calculateStateHash(): Promise<DataHash> {
    return this.transaction.calculateStateHash();
  }

  /**
   * @inheritDoc
   */
  public calculateTransactionHash(): Promise<DataHash> {
    return this.transaction.calculateTransactionHash();
  }

  /**
   * @inheritDoc
   */
  public toCBOR(): Uint8Array {
    return CborSerializer.encodeArray(this.transaction.toCBOR(), this.inclusionProof.toCBOR());
  }

  /**
   * @returns {string} String representation of the certified transaction.
   */
  public toString(): string {
    return dedent`
      CertifiedTransferTransaction
        ${this.transaction.toString()}
        Reference Time: ${this.referenceTime.toString()}
        ${this.inclusionProof.toString()}`;
  }
}
