import { HeartIcon } from "@phosphor-icons/react";
import { motion, useReducedMotionConfig } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ease, likeFeels, type LikeFeel } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function LikeButton({
  className,
  feel = likeFeels.heartbeat,
  label,
  liked,
  onToggle,
  tabIndex,
}: {
  className?: string;
  feel?: LikeFeel;
  label: string;
  liked: boolean;
  onToggle: () => void;
  tabIndex?: number;
}) {
  const reduceMotion = useReducedMotionConfig();
  // Each pointer like is a new run: the key remounts its animated parts
  const [runKey, setRunKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const isLikeRunning = liked && isRunning;
  // the outline, pulse, rings and sparks; reduced motion keeps only the fill's fade
  const showsEffects = isLikeRunning && !reduceMotion;
  const { fill, outline, pulse, rings, sparks } = feel;
  const dots = sparkDots(feel);

  // Every animated part reports when it ends; the last one ends the run
  const partsLeft = useRef(0);
  const animatedPartCount = 2 + (pulse ? 1 : 0) + rings.length + dots.length;

  const finishPart = () => {
    partsLeft.current -= 1;

    if (partsLeft.current === 0) setIsRunning(false);
  };

  const fillTransition =
    "type" in fill.transition
      ? fill.transition
      : { duration: fill.transition.duration, ease: fill.transition.curve };

  const fillDelay = showsEffects ? fill.delay : 0;

  return (
    <Button
      aria-label={label}
      aria-pressed={liked}
      className={cn("hover:not-data-disabled:bg-transparent", className)}
      onClick={(event) => {
        // like via keyboard is instant with no animation
        if (!liked && event.detail > 0) {
          partsLeft.current = reduceMotion ? 1 : animatedPartCount;
          setRunKey((key) => key + 1);
          setIsRunning(true);
        } else {
          setIsRunning(false);
        }

        onToggle();
      }}
      onPointerDown={(event) => event.preventDefault()}
      size="icon-sm"
      static
      tabIndex={tabIndex}
      type="button"
      variant="row-action"
    >
      <span className="relative size-4">
        {showsEffects && (
          <span aria-hidden="true" key={`rings-${runKey}`}>
            {pulse && (
              <motion.span
                animate={{
                  opacity: [0, pulse.peakOpacity, 0],
                  transform: [`scale(${pulse.from})`, "scale(1)"],
                }}
                className="absolute top-1/2 left-1/2 -mt-2.75 -ml-2.75 size-5.5 rounded-full bg-current opacity-0"
                onAnimationComplete={finishPart}
                transition={{
                  duration: pulse.duration,
                  ease: pulse.curve,
                  opacity: { duration: pulse.duration, times: [0, 0.2, 1] },
                }}
              />
            )}
            {rings.map((ring, index) => (
              <motion.span
                animate={{
                  opacity: [0, ring.peakOpacity, 0],
                  transform: [`scale(${ring.from})`, "scale(1)"],
                }}
                className="absolute top-1/2 left-1/2 -mt-2.75 -ml-2.75 size-5.5 rounded-full border border-current opacity-0"
                key={index}
                onAnimationComplete={finishPart}
                transition={{
                  delay: ring.delay,
                  duration: ring.duration,
                  ease: ring.curve,
                  opacity: { delay: ring.delay, duration: ring.duration, times: [0, 0.1, 1] },
                }}
              />
            ))}
          </span>
        )}
        {(!liked || isLikeRunning) && (
          <motion.span
            animate={
              showsEffects
                ? { opacity: 0, transform: `scale(${outline.scale})` }
                : { opacity: 1, transform: "scale(1)" }
            }
            className="absolute inset-0"
            initial={false}
            onAnimationComplete={showsEffects ? finishPart : undefined}
            transition={
              showsEffects ? { duration: outline.duration, ease: outline.curve } : { duration: 0 }
            }
          >
            <HeartIcon aria-hidden="true" className="size-4" weight="regular" />
          </motion.span>
        )}
        {liked && (
          <motion.span
            animate={
              reduceMotion
                ? { opacity: 1 }
                : {
                    filter: "blur(0px)",
                    opacity: 1,
                    transform: isLikeRunning
                      ? fill.scale.map((scale) => `scale(${scale})`)
                      : "scale(1)",
                  }
            }
            className="absolute inset-0"
            initial={
              isLikeRunning
                ? reduceMotion
                  ? { opacity: 0 }
                  : {
                      filter: `blur(${fill.blur}px)`,
                      opacity: 0,
                      transform: `scale(${fill.scale[0]})`,
                    }
                : false
            }
            key={`fill-${runKey}`}
            onAnimationComplete={isLikeRunning ? finishPart : undefined}
            transition={
              reduceMotion
                ? fillTransition
                : {
                    ...(fill.reveal ? { duration: fill.reveal, ease: ease.out } : fillTransition),
                    delay: fillDelay,
                    transform: { ...fillTransition, delay: fillDelay, times: fill.times },
                  }
            }
          >
            <HeartIcon aria-hidden="true" className="size-4" weight="fill" />
          </motion.span>
        )}
        {showsEffects && sparks && (
          <span aria-hidden="true" key={`sparks-${runKey}`}>
            {dots.map((dot, index) => (
              <motion.span
                animate={{ opacity: [0, dot.peak, 0], transform: [dot.from, dot.to] }}
                className={
                  dot.isTrail
                    ? "absolute top-1/2 left-1/2 -mt-[0.75px] -ml-[0.75px] size-[1.5px] rounded-full bg-current opacity-0"
                    : "absolute top-1/2 left-1/2 -mt-px -ml-px size-0.5 rounded-full bg-current opacity-0"
                }
                key={index}
                onAnimationComplete={finishPart}
                transition={{
                  delay: dot.delay,
                  duration: sparks.duration,
                  ease: sparks.curve,
                  opacity: { delay: dot.delay, duration: sparks.duration, times: [0, 0.2, 1] },
                }}
              />
            ))}
          </span>
        )}
      </span>
    </Button>
  );
}

// Each pair is a lead dot and a smaller, dimmer one a few degrees behind it
function sparkDots({ sparks }: LikeFeel) {
  if (!sparks) return [];

  return sparks.pairs.flatMap((pair) =>
    [false, true].map((isTrail) => {
      const angle = ((pair.angle + (isTrail ? sparks.trailAngle : 0)) * Math.PI) / 180;
      const distance = pair.distance - (isTrail ? sparks.trailDistance : 0);
      const x = Math.cos(angle);
      const y = Math.sin(angle);

      return {
        delay: sparks.delay + pair.delay + (isTrail ? sparks.trailDelay : 0),
        from: `translate(${x * sparks.startDistance}px, ${y * sparks.startDistance}px) scale(1)`,
        isTrail,
        peak: isTrail ? pair.peak * sparks.trailOpacity : pair.peak,
        to: `translate(${x * distance}px, ${y * distance}px) scale(${sparks.endScale})`,
      };
    }),
  );
}
