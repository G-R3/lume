import type { PointerEvent } from "react";

export function isListBackgroundPointerDown(event: PointerEvent<HTMLElement>) {
  const container = event.currentTarget;
  const target = event.target;

  if (event.button !== 0 || !(target instanceof Element) || !container.contains(target)) {
    return false;
  }

  if (target === container) return event.nativeEvent.offsetX < container.clientWidth;

  return !target.closest("tr[data-entry-id], thead, a, button, input, [role='toolbar']");
}
