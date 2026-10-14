import { ease, likeFeels, likeSparks, spring, type LikeFeel } from "@/lib/motion";

// Lorenzo Dossi's ease-out on untitled.lorenzodossi.com: steeper than ease.out, so it can run longer
const lorenzo = [0.16, 1, 0.3, 1] as const;

export type FeelName = "heartbeat" | "alive" | "snappy" | "round2" | "focus";

export const feelNames: readonly FeelName[] = ["heartbeat", "alive", "snappy", "round2", "focus"];

export const heartFeels: Record<FeelName, { feel: LikeFeel; label: string; note: string }> = {
  heartbeat: {
    feel: likeFeels.heartbeat,
    label: "Heartbeat (default)",
    note: "Lume is a music app: the heart arrives on a lub-dub (a strong beat, a softer one 200ms later), each beat sends out a ring, and the second releases the sparks. About 850ms.",
  },
  alive: {
    feel: likeFeels.alive,
    label: "Alive",
    note: "After Family and the skills' spring rules: small elements need more bounce to read the same, so the fill overshoots once. About 690ms.",
  },
  snappy: {
    feel: likeFeels.snappy,
    label: "Snappy",
    note: "The frequency rule: liking happens tens of times a day, so it keeps the shape but at ~60% of the time, on the Vaul curve, with no glow and three pairs of dots. About 400ms.",
  },
  round2: {
    label: "Round 2 (lab only)",
    note: "The previous default: the fill on spring.ui, everything else on ease.out. About 690ms.",
    feel: {
      outline: { curve: ease.out, duration: 0.12, scale: 0.5 },
      fill: { blur: 4, delay: 0.04, scale: [0.25, 1], transition: spring.ui },
      pulse: { curve: ease.out, duration: 0.45, from: 0.3, peakOpacity: 0.14 },
      rings: [{ curve: ease.out, delay: 0.08, duration: 0.35, from: 0.55, peakOpacity: 0.5 }],
      sparks: likeSparks,
    },
  },
  focus: {
    label: "Focus pull (lab only)",
    note: "After Lorenzo: the heart arrives from slightly larger and blurrier and settles inward, like a lens finding focus, on his steep curve. Slower: the heart is soft for ~300ms. About 1s.",
    feel: {
      outline: { curve: lorenzo, duration: 0.16, scale: 0.6 },
      fill: {
        blur: 6,
        delay: 0.06,
        scale: [1.35, 1],
        transition: { curve: lorenzo, duration: 0.5 },
      },
      pulse: null,
      rings: [{ curve: lorenzo, delay: 0.06, duration: 0.6, from: 0.7, peakOpacity: 0.35 }],
      sparks: {
        ...likeSparks,
        curve: lorenzo,
        delay: 0.12,
        duration: 0.8,
        endScale: 0.3,
        startDistance: 8,
        trailAngle: 10,
        trailDelay: 0.05,
        trailDistance: 3,
      },
    },
  },
};
