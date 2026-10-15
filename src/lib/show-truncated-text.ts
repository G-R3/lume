import type { PointerEvent } from "react";

let pendingCell: HTMLElement | null = null;

export function showTruncatedText(event: PointerEvent<HTMLElement>) {
  if (!(event.target instanceof Element)) return;

  const cell = event.target.closest<HTMLElement>("[data-truncate]");

  if (!cell) return;

  // Rows scrolling under the pointer fire this every frame, before layout is up to date. Measuring
  // after the next paint reads the layout the browser already did instead of forcing a new one.
  if (pendingCell === null) requestAnimationFrame(() => setTimeout(measurePendingCell));

  pendingCell = cell;
}

function measurePendingCell() {
  const cell = pendingCell;
  pendingCell = null;

  if (!cell?.isConnected) return;

  if (cell.scrollWidth > cell.clientWidth) cell.title = cell.textContent ?? "";
  else cell.removeAttribute("title");
}
