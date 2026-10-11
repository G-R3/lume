export function installForcedStates(root: HTMLElement) {
  const style = document.createElement("style");

  const refreshStyles = () => {
    style.textContent = Array.from(document.styleSheets)
      .filter((sheet) => sheet !== style.sheet)
      .flatMap((sheet) =>
        Array.from(sheet.cssRules).flatMap((rule) => {
          const forced = rule.cssText.replace(
            /(?<!\\):(focus-visible|focus-within|hover|active)\b|\[data-dragging\]/g,
            (_, state: string | undefined) => `[data-forced-${state ?? "dragging"}]`,
          );

          return forced === rule.cssText ? [] : [forced];
        }),
      )
      .join("\n");
  };

  const apply = () => {
    root.querySelectorAll<HTMLElement>("[data-force-states]").forEach((specimen) => {
      specimen.querySelectorAll(specimen.dataset.forceSelector ?? "").forEach((target) => {
        specimen.dataset.forceStates?.split(" ").forEach((state) => {
          target.setAttribute(`data-forced-${state}`, "");

          if (state !== "hover" && state !== "focus-visible" && state !== "focus-within") return;

          const inherited = state === "hover" ? "hover" : "focus-within";

          for (
            let ancestor: Element | null = target;
            ancestor && specimen.contains(ancestor);
            ancestor = ancestor.parentElement
          ) {
            ancestor.setAttribute(`data-forced-${inherited}`, "");
          }
        });
      });
    });
  };

  refreshStyles();
  document.head.append(style);
  apply();

  const observer = new MutationObserver(apply);
  observer.observe(root, { childList: true, subtree: true });
  import.meta.hot?.on("vite:afterUpdate", refreshStyles);

  return () => {
    observer.disconnect();
    import.meta.hot?.off("vite:afterUpdate", refreshStyles);
    style.remove();
  };
}
