import type { QueueContext, QueueRandom } from "../../src/lib/queue/commands";

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
