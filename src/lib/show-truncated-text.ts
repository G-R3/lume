import type { PointerEvent } from "react";

// Long text truncates; hovering it shows the full text, measured only when the pointer arrives.
export function showTruncatedText(event: PointerEvent<HTMLElement>) {
  if (!(event.target instanceof Element)) return;

  const cell = event.target.closest<HTMLElement>("[data-truncate]");

  if (!cell) return;

  if (cell.scrollWidth > cell.clientWidth) cell.title = cell.textContent ?? "";
  else cell.removeAttribute("title");
}
