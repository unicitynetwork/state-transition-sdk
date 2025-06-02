import { BurnPredicate } from './BurnPredicate.js';
import { IPredicate, IPredicateJson } from './IPredicate.js';
import { IPredicateFactory } from './IPredicateFactory.js';
import { MaskedPredicate } from './MaskedPredicate.js';
import { PredicateType } from './PredicateType.js';
import { UnmaskedPredicate } from './UnmaskedPredicate.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

/**
 * Default implementation of {@link IPredicateFactory} used by the SDK.
 */
export class PredicateFactory implements IPredicateFactory {
  /**
   * Instantiate a predicate based on its serialized JSON description.
   */
  public create(tokenId: TokenId, tokenType: TokenType, data: IPredicateJson): Promise<IPredicate> {
    switch (data.type) {
      case PredicateType.BURN:
        return BurnPredicate.fromJSON(tokenId, tokenType, data);
      case PredicateType.MASKED:
        return MaskedPredicate.fromJSON(tokenId, tokenType, data);
      case PredicateType.UNMASKED:
        return UnmaskedPredicate.fromJSON(tokenId, tokenType, data);
      default:
        throw new Error(`Unknown predicate type: ${data.type}`);
    }
  }
}
