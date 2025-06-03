import { IPredicate, IPredicateJson } from './IPredicate.js';
import { TokenId } from '../token/TokenId.js';
import { TokenType } from '../token/TokenType.js';

/**
 * Factory capable of reconstructing predicates from their JSON form.
 */
export interface IPredicateFactory {
  /**
   * Create a predicate instance for the given token.
   *
   * @param tokenId    Token identifier
   * @param tokenType  Token type
   * @param data       JSON representation of the predicate
   */
  create(tokenId: TokenId, tokenType: TokenType, data: IPredicateJson): Promise<IPredicate>;
}
