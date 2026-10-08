// Motion tokens. Components import these instead of writing their own springs,
// curves or durations, so the app's feel changes in one place.
// The CSS side (--ease-out, --ease-in-out, --ease-crossfade) lives in src/index.css.

export const spring = {
  ui: { type: "spring", duration: 0.3, bounce: 0 },
  exit: { type: "spring", duration: 0.2, bounce: 0 },
} as const;

export const ease = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.645, 0.045, 0.355, 1],
  crossfade: [0.2, 0, 0, 1],
} as const;

export const duration = {
  fast: 0.15,
  exit: 0.1,
} as const;

export const pressScale = 0.96;
