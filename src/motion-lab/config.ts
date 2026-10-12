import { createContext, useContext } from "react";
import type { Transition } from "motion/react";

export type Spring = { visualDuration: number; bounce: number; duration?: number };

export const feels = {
  today: {
    label: "Today",
    note: "spring.ui and spring.exit from src/lib/motion.ts",
    enter: { visualDuration: 0.2, bounce: 0, duration: 0.3 },
    exit: { visualDuration: 0.13, bounce: 0, duration: 0.2 },
  },
  tape: {
    label: "Tape",
    note: "Recommended. A reel settling: quick to leave, long soft landing, no overshoot",
    enter: { visualDuration: 0.34, bounce: 0 },
    exit: { visualDuration: 0.16, bounce: 0 },
  },
  glass: {
    label: "Glass",
    note: "SwiftUI .snappy-like: shorter, a hint of overshoot",
    enter: { visualDuration: 0.26, bounce: 0.12 },
    exit: { visualDuration: 0.14, bounce: 0 },
  },
  smooth: {
    label: "Smooth",
    note: "SwiftUI .smooth default: 0.5s, no bounce. Too slow for tens a day; here for contrast",
    enter: { visualDuration: 0.5, bounce: 0 },
    exit: { visualDuration: 0.25, bounce: 0 },
  },
} as const satisfies Record<string, { label: string; note: string; enter: Spring; exit: Spring }>;

export type FeelName = keyof typeof feels | "custom";

export type LabConfig = {
  feel: FeelName;
  custom: { enter: Spring; exit: Spring };
  speed: number;
  reduced: boolean;
  trackChange: "instant" | "crossfade" | "roll" | "slide";
  distance: number;
  stagger: number;
  blur: number;
  drain: boolean;
  bandGlide: boolean;
  counter: boolean;
  grab: boolean;
  rubber: boolean;
  glide: boolean;
  smoothFill: boolean;
  powerOn: boolean;
  powerStagger: number;
  flight: boolean;
  sound: boolean;
  soundSource: "tone" | "loop" | "track";
  ramps: boolean;
};

export const recommended: LabConfig = {
  feel: "tape",
  custom: { enter: feels.tape.enter, exit: feels.tape.exit },
  speed: 1,
  reduced: false,
  trackChange: "roll",
  distance: 8,
  stagger: 30,
  blur: 2,
  drain: true,
  bandGlide: true,
  counter: true,
  grab: true,
  rubber: true,
  glide: true,
  smoothFill: true,
  powerOn: true,
  powerStagger: 6,
  flight: false,
  sound: false,
  soundSource: "tone",
  ramps: true,
};

export const phase10: LabConfig = {
  ...recommended,
  feel: "today",
  trackChange: "crossfade",
  drain: false,
  bandGlide: false,
  counter: false,
  grab: false,
  rubber: false,
  glide: false,
  smoothFill: false,
  powerOn: false,
  ramps: false,
};

export const everythingOff: LabConfig = {
  ...phase10,
  trackChange: "instant",
};

export const LabConfigContext = createContext<LabConfig>(recommended);

export function useLab() {
  const config = useContext(LabConfigContext);

  const feel: { enter: Spring; exit: Spring } =
    config.feel === "custom" ? config.custom : feels[config.feel];

  /** Springs scaled by the slow-motion control. Durations are in seconds. */
  const spring = (which: "enter" | "exit", delay = 0): Transition => {
    const { duration, visualDuration, bounce } = feel[which];

    return duration === undefined
      ? {
          type: "spring",
          visualDuration: visualDuration / config.speed,
          bounce,
          delay: delay / config.speed,
        }
      : { type: "spring", duration: duration / config.speed, bounce, delay: delay / config.speed };
  };

  const tween = (duration: number, ease: Transition["ease"], delay = 0): Transition => ({
    duration: duration / config.speed,
    ease,
    delay: delay / config.speed,
  });

  return { config, feel, spring, tween };
}
