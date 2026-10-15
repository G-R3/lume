import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// twMerge reads `text-body` as a text color and drops the color class beside it
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["meta", "body", "copy", "title", "display"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
