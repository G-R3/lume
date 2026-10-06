import type { QueueContext, QueueRandom } from "../../src/lib/queue/commands";

/** Fails the test when a transition makes a random choice that the test did not supply. */
export const noRandom: QueueRandom = {
  shuffle: () => {
    throw new Error("Unexpected shuffle");
  },
  index: () => {
    throw new Error("Unexpected random index");
  },
};

export function queueContext(
  availableTrackIds: Iterable<number>,
  random: QueueRandom = noRandom,
): QueueContext {
  return { availableTrackIds: new Set(availableTrackIds), random };
}
