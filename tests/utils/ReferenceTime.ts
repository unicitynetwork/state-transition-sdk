/**
 * Reference time the fixtures pin a certified leaf to.
 *
 * A real service sets the round's input record timestamp to the very reference
 * time its leaves are built from, so a fixture certificate defaults to
 * certifying a round with this clock. Pairing a leaf with a round whose
 * timestamp precedes it is not something any aggregator can produce, and the
 * verification rule now rejects it.
 */
export const REFERENCE_TIME = 1755000000n;
