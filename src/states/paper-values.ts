// Paper's literal values (frame 17 and 08c, read with get_jsx on October 8, 2026). They are
// written out instead of read from the app's tokens so a wrong token shows up as drift.
export const paper = {
  accent10: "#EEBF5A1A",
  amber: "#EEBF5A",
  neutral50: "#FAFAFA",
  neutral100: "#F5F5F5",
  neutral400: "#A3A3A3",
  neutral500: "#737373",
  neutral600: "#525252",
  neutral700: "#404040",
  neutral750: "#333333",
  neutral800: "#262626",
  neutral850: "#1E1E1E",
  neutral900: "#171717",
  neutral950: "#0A0A0A",
  red300: "#FFA2A2",
  red350: "#FF7778",
  red400: "#FF6467",
  transparent: "transparent",
} as const;

export const focusRing = `2px ${paper.neutral500} 2px`;

export const insetFocusRing = `2px ${paper.neutral500} -2px`;
