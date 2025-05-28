import { BurnPredicate } from './BurnPredicate.js';
import { IPredicate, IPredicateDto } from './IPredicate.js';
import { IPredicateFactory } from './IPredicateFactory.js';
import { MaskedPredicate } from './MaskedPredicate.js';
import { PredicateType } from './PredicateType.js';
import { UnmaskedPredicate } from './UnmaskedPredicate.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

export class PredicateFactory implements IPredicateFactory {
  public create(tokenId: TokenId, tokenType: TokenType, data: IPredicateDto): Promise<IPredicate> {
    switch (data.type) {
      case PredicateType.BURN:
        return BurnPredicate.fromDto(tokenId, tokenType, data);
      case PredicateType.MASKED:
        return MaskedPredicate.fromDto(tokenId, tokenType, data);
      case PredicateType.UNMASKED:
        return UnmaskedPredicate.fromDto(tokenId, tokenType, data);
      default:
        throw new Error(`Unknown predicate type: ${data.type}`);
    }
  }
}
