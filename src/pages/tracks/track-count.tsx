import { animate, type AnimationPlaybackControls } from "motion";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { headerDelay } from "@/lib/first-scan";
import { ease } from "@/lib/motion";

export function TrackCount({
  total,
  isRevealing,
  children,
}: {
  total: number;
  isRevealing: boolean;
  children: ReactNode;
}) {
  const countRef = useRef<HTMLSpanElement>(null);
  const statsRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const count = countRef.current;
    const stats = statsRef.current;

    if (!count || !stats) return;

    const finalText = total.toLocaleString();

    if (!isRevealing || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      count.textContent = finalText;

      return;
    }

    stats.style.display = "inline-block";
    stats.style.whiteSpace = "pre";

    let glide: AnimationPlaybackControls | undefined;

    const showCount = (text: string) => {
      if (count.textContent === text) return;

      const widthBefore = count.getBoundingClientRect().width;
      count.textContent = text;
      const shift = count.getBoundingClientRect().width - widthBefore;

      if (!shift) return;

      const startX = new DOMMatrix(getComputedStyle(stats).transform).m41 - shift;
      glide?.stop();
      glide = animate(
        stats,
        { transform: [`translateX(${startX}px)`, "none"] },
        { duration: 0.15, ease: ease.inOut },
      );
    };

    showCount("00");

    const animation = animate(0, total, {
      delay: headerDelay,
      duration: Math.min(0.8, 0.25 + total * 0.004),
      ease: [0.33, 1, 0.68, 1],
      onUpdate: (value) => {
        const rounded = Math.round(value);
        showCount(rounded < 10 ? `0${rounded}` : rounded.toLocaleString());
      },
      onComplete: () => showCount(finalText),
    });

    return () => {
      animation.stop();
      glide?.stop();
      stats.style.removeProperty("transform");
      stats.style.removeProperty("display");
      stats.style.removeProperty("white-space");
    };
  }, [total, isRevealing]);

  return (
    <>
      <span data-slot="track-count" ref={countRef} />
      <span data-slot="track-stats-after-count" ref={statsRef}>
        {children}
      </span>
    </>
  );
}
