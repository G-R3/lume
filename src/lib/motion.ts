export const spring = {
  ui: { type: "spring", duration: 0.3, bounce: 0 },
  exit: { type: "spring", duration: 0.2, bounce: 0 },
} as const;

export const ease = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.645, 0.045, 0.355, 1],
  crossfade: [0.2, 0, 0, 1],
  outExpo: [0.19, 1, 0.22, 1],
  sheet: [0.32, 0.72, 0, 1],
} as const;

export const duration = {
  fast: 0.15,
  exit: 0.1,
  enter: 0.25,
  move: 0.2,
} as const;

export const pressScale = 0.96;

type Curve = readonly [number, number, number, number];

export type LikeFeel = {
  outline: { curve: Curve; duration: number; scale: number };
  fill: {
    blur: number;
    delay: number;
    reveal?: number;
  } & (
    | {
        scale: readonly [number, number];
        times?: never;
        transition: { type: "spring"; duration: number; bounce: number };
      }
    | {
        scale: readonly number[];
        times?: number[];
        transition: { curve: Curve; duration: number };
      }
  );
  pulse: { curve: Curve; duration: number; from: number; peakOpacity: number } | null;
  rings: readonly {
    curve: Curve;
    delay: number;
    duration: number;
    from: number;
    peakOpacity: number;
  }[];
  sparks: {
    curve: Curve;
    delay: number;
    duration: number;
    endScale: number;
    pairs: readonly { angle: number; delay: number; distance: number; peak: number }[];
    startDistance: number;
    trailAngle: number;
    trailDelay: number;
    trailDistance: number;
    trailOpacity: number;
  } | null;
};

export const likeSparks: NonNullable<LikeFeel["sparks"]> = {
  curve: ease.out,
  delay: 0.1,
  duration: 0.55,
  endScale: 0.4,
  pairs: [
    { angle: -90, delay: 0, distance: 12, peak: 0.9 },
    { angle: -16, delay: 0.02, distance: 11, peak: 0.6 },
    { angle: 56, delay: 0.01, distance: 12.5, peak: 0.8 },
    { angle: 124, delay: 0.03, distance: 11, peak: 0.5 },
    { angle: 196, delay: 0.015, distance: 11.5, peak: 0.7 },
  ],
  startDistance: 7,
  trailAngle: 14,
  trailDelay: 0.03,
  trailDistance: 2.5,
  trailOpacity: 0.6,
};

export const likeFeels = {
  alive: {
    outline: { curve: ease.out, duration: 0.1, scale: 0.4 },
    fill: {
      blur: 3,
      delay: 0.03,
      scale: [0.2, 1],
      transition: { type: "spring", duration: 0.45, bounce: 0.4 },
    },
    pulse: { curve: ease.outExpo, duration: 0.4, from: 0.3, peakOpacity: 0.12 },
    rings: [{ curve: ease.outExpo, delay: 0.06, duration: 0.35, from: 0.5, peakOpacity: 0.25 }],
    sparks: { ...likeSparks, curve: ease.outExpo, delay: 0.08 },
  },
  heartbeat: {
    outline: { curve: ease.out, duration: 0.1, scale: 0.5 },
    fill: {
      blur: 3,
      delay: 0.02,
      scale: [0.3, 1.14, 0.94, 1.07, 1],
      times: [0, 0.28, 0.5, 0.68, 1],
      reveal: 0.12,
      transition: { curve: ease.inOut, duration: 0.5 },
    },
    pulse: { curve: ease.outExpo, duration: 0.35, from: 0.4, peakOpacity: 0.12 },
    rings: [
      { curve: ease.outExpo, delay: 0.1, duration: 0.35, from: 0.6, peakOpacity: 0.22 },
      { curve: ease.outExpo, delay: 0.32, duration: 0.35, from: 0.6, peakOpacity: 0.12 },
    ],
    sparks: { ...likeSparks, curve: ease.outExpo, delay: 0.33, duration: 0.5 },
  },
  snappy: {
    outline: { curve: ease.sheet, duration: 0.08, scale: 0.6 },
    fill: {
      blur: 2,
      delay: 0.02,
      scale: [0.4, 1],
      transition: { type: "spring", duration: 0.2, bounce: 0 },
    },
    pulse: null,
    rings: [{ curve: ease.sheet, delay: 0.04, duration: 0.25, from: 0.6, peakOpacity: 0.22 }],
    sparks: {
      ...likeSparks,
      curve: ease.sheet,
      delay: 0.05,
      duration: 0.33,
      pairs: likeSparks.pairs.filter((_pair, index) => index % 2 === 0),
    },
  },
} satisfies Record<string, LikeFeel>;

export function likeDuration(feel: LikeFeel) {
  const { sparks } = feel;

  return Math.max(
    feel.outline.duration,
    feel.fill.delay + feel.fill.transition.duration,
    feel.pulse?.duration ?? 0,
    ...feel.rings.map((ring) => ring.delay + ring.duration),
    sparks
      ? sparks.delay +
          Math.max(...sparks.pairs.map((pair) => pair.delay)) +
          sparks.trailDelay +
          sparks.duration
      : 0,
  );
}
