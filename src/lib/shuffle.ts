/** Return a shuffled copy. The caller supplies a random value from zero up to one. */
export function shuffleEntries<T>(entries: readonly T[], random: () => number) {
  const shuffled = [...entries];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled;
}
