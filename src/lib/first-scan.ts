import { animate, stagger, type AnimationPlaybackControls } from "motion";
import { ease } from "@/lib/motion";

const enterDuration = 0.25;

const exitDuration = 0.15;

const clearDelay = 0.08;

const clearDuration = 0.2;

export const headerDelay = clearDelay + enterDuration;

const rowStep = 0.04;

const rowRise = 4;

const rowBlur = 1.5;

const minimumLength = 0.8;

const easeCssDefault = [0.25, 0.1, 0.25, 1] as const;

const inlineStylesToClear = ["opacity", "transform", "filter", "background-color"];

type Targets = Element | Element[] | null | undefined;

export function playFirstScan(
  firstRunScreen: HTMLElement,
  list: HTMLElement | null,
  onDone: () => void,
) {
  const animations: AnimationPlaybackControls[] = [];
  const animatedElements = new Set<Element>();

  const animateElements = (
    targets: Targets,
    keyframes: Record<string, (string | number)[]>,
    options: Parameters<typeof animate>[2],
  ) => {
    const elements = [targets ?? []].flat();

    if (elements.length === 0) return;

    elements.forEach((element) => animatedElements.add(element));
    animations.push(animate(elements, keyframes, options));
  };

  const fadeOutFirstRunScreen = () => {
    animateElements(
      firstRunScreen,
      { opacity: [1, 0] },
      { duration: exitDuration, ease: ease.out },
    );

    return exitDuration;
  };

  const revealLibrary = (list: HTMLElement) => {
    const screenBackground = firstRunScreen.querySelector("main") ?? firstRunScreen;
    const scroller = list.closest<HTMLElement>("[data-scroll-container]");
    const pageHeader = document.querySelector("[data-slot=page-header]");
    const titleGroup = pageHeader?.children[0];
    animateElements(
      Array.from(firstRunScreen.querySelectorAll("[data-onboarding-part]")),
      { opacity: [1, 0], transform: ["translateY(0)", "translateY(-4px)"] },
      { delay: stagger(0.03), duration: exitDuration, ease: ease.out },
    );

    const shimmer = firstRunScreen.querySelector("[data-slot=scan-glyph-shimmer]");

    if (shimmer)
      [shimmer, ...shimmer.querySelectorAll("rect")].forEach((dot) => {
        const opacity = Number(getComputedStyle(dot).opacity);

        if (dot instanceof SVGElement) dot.style.animation = "none";

        animateElements(
          dot,
          { opacity: [opacity, 1] },
          { duration: exitDuration, ease: easeCssDefault },
        );
      });

    animateElements(
      firstRunScreen.querySelector("[data-slot=scan-glyph]"),
      { opacity: [1, 0] },
      { duration: exitDuration, ease: ease.out },
    );
    const pageColor = getComputedStyle(screenBackground).backgroundColor;
    animateElements(
      screenBackground,
      { backgroundColor: [pageColor, `color-mix(in oklab, ${pageColor} 0%, transparent)`] },
      { delay: clearDelay, duration: clearDuration, ease: ease.out },
    );
    animateElements(
      document.querySelector("[data-slot=sidebar-container][data-side=left]"),
      { opacity: [0, 1], transform: ["translateX(-12px)", "none"] },
      { delay: clearDelay + 0.04, duration: enterDuration, ease: ease.out },
    );
    animateElements(
      document.querySelector("header[aria-label=Player]"),
      { opacity: [0, 1], transform: ["translateY(-8px)", "none"] },
      { delay: clearDelay + 0.1, duration: enterDuration, ease: ease.out },
    );

    const riseIn = (targets: Targets, delay: number | ReturnType<typeof stagger>) =>
      animateElements(
        targets,
        { opacity: [0, 1], transform: ["translateY(4px)", "none"] },
        { delay, duration: enterDuration, ease: ease.out },
      );

    riseIn(titleGroup?.querySelector("h1"), headerDelay - 0.14);
    riseIn(titleGroup?.querySelector("p"), headerDelay - 0.1);
    riseIn(
      Array.from(pageHeader?.children ?? []).slice(1),
      stagger(0.05, { startDelay: headerDelay - 0.09 }),
    );
    animateElements(
      list.querySelector("thead"),
      { opacity: [0, 1] },
      { delay: headerDelay - 0.06, duration: enterDuration, ease: ease.out },
    );

    const scrollerBottom = scroller?.getBoundingClientRect().bottom ?? Infinity;

    const rowsOnScreen = Array.from(
      list.querySelectorAll<HTMLElement>("tbody tr[data-entry-id]"),
    ).filter((row) => row.getBoundingClientRect().top < scrollerBottom);

    animateElements(
      rowsOnScreen,
      {
        opacity: [0, 1],
        transform: [`translateY(${rowRise}px)`, "none"],
        filter: [`blur(${rowBlur}px)`, "none"],
      },
      {
        delay: stagger(rowStep, { startDelay: headerDelay }),
        duration: enterDuration,
        ease: ease.out,
      },
    );

    return Math.max(
      headerDelay + (rowsOnScreen.length - 1) * rowStep + enterDuration,
      headerDelay + minimumLength,
    );
  };

  // Motion's animate() does not read MotionConfig's reduced-motion preference.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seconds = list && !reduced ? revealLibrary(list) : fadeOutFirstRunScreen();
  const timeout = window.setTimeout(onDone, seconds * 1000);

  return () => {
    clearTimeout(timeout);
    animations.forEach((animation) => animation.cancel());
    animatedElements.forEach((element) => {
      if (element instanceof HTMLElement || element instanceof SVGElement)
        inlineStylesToClear.forEach((style) => element.style.removeProperty(style));
    });
  };
}
