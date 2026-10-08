// Reads rendered metrics from specimens on the states page and compares them with Paper's computed
// styles. The page overlay and scripts/sandbox/measure.ts both call `measureSpecimens`.

export type FontRole = "mono" | "sans";

/** Paper's value per property, in CSS pixels where the property is a length. */
export type PaperValues = {
  backgroundColor?: string;
  borderRadius?: number;
  color?: string;
  /** A 1px boundary, written as "<width>px <hex>", whether Paper draws it as a border or an inset ring. */
  edge?: string;
  fontFamily?: FontRole;
  fontSize?: number;
  fontWeight?: number;
  /** The focus ring, written as "<width>px <hex> <offset>px". */
  focusRing?: string;
  height?: number;
  letterSpacing?: number;
  /** Distance from the specimen's left edge to the element's left edge. */
  left?: number;
  lineHeight?: number;
  opacity?: number;
  paddingLeft?: number;
  paddingRight?: number;
  placeholderColor?: string;
  width?: number;
};

export type MeasuredProperty = keyof PaperValues;

export type PartSpec = {
  /** Shown in the overlay and the report. */
  name: string;
  paper: PaperValues;
  /** Relative to the specimen's content. `null` measures the specimen's first element. */
  selector: string | null;
};

export type PartResult = {
  checks: PropertyCheck[];
  missing: boolean;
  name: string;
};

export type PropertyCheck = {
  app: string;
  matches: boolean;
  paper: string;
  property: MeasuredProperty;
};

export type SpecimenResult = {
  id: string;
  parts: PartResult[];
};

const lengthTolerance = 0.5;

const channelTolerance = 2;

let colorContext: CanvasRenderingContext2D | null = null;

/** Converts any CSS color, including oklch() and color-mix(), to #RRGGBB or #RRGGBBAA. */
export function toHex(color: string) {
  if (color === "transparent") return "transparent";

  colorContext ??= document
    .createElement("canvas")
    .getContext("2d", { colorSpace: "srgb", willReadFrequently: true });

  if (!colorContext) return color;

  colorContext.clearRect(0, 0, 1, 1);
  colorContext.fillStyle = "#000";
  colorContext.fillStyle = color;
  colorContext.fillRect(0, 0, 1, 1);

  const [red = 0, green = 0, blue = 0, alpha = 0] = colorContext.getImageData(0, 0, 1, 1).data;

  if (alpha === 0) return "transparent";

  const hex = [red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("");

  return alpha === 255
    ? `#${hex}`.toUpperCase()
    : `#${hex}${alpha.toString(16).padStart(2, "0")}`.toUpperCase();
}

export function measureSpecimens(root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-specimen]")).map((specimen) =>
    measureSpecimen(specimen),
  );
}

export function measureSpecimen(specimen: HTMLElement): SpecimenResult {
  const id = specimen.dataset.specimen ?? "";
  const content = specimen.querySelector<HTMLElement>("[data-specimen-content]");
  const parts = specimenParts.get(id) ?? [];

  return {
    id,
    parts: parts.map((part) => {
      const element = content
        ? part.selector === null
          ? content.firstElementChild
          : content.querySelector(part.selector)
        : null;

      if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
        return { checks: [], missing: true, name: part.name };
      }

      return {
        checks: checkElement(element, part.paper, content?.getBoundingClientRect().left ?? 0),
        missing: false,
        name: part.name,
      };
    }),
  };
}

/** Specimens register their parts here so measuring needs only the DOM and the id. */
export const specimenParts = new Map<string, readonly PartSpec[]>();

function checkElement(element: Element, paper: PaperValues, originLeft: number) {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();

  // SAFETY: `paper` is a PaperValues literal, so its own keys are MeasuredProperty names.
  const properties = Object.keys(paper) as MeasuredProperty[];

  return properties.flatMap((property): PropertyCheck[] => {
    const expected = paper[property];

    // Specs leave a property undefined when Paper's state does not set it.
    if (expected === undefined) return [];

    const app =
      property === "left"
        ? `${round(box.left - originLeft)}px`
        : readProperty(element, style, box, property);

    const paperText = String(expected);

    return [
      {
        app,
        matches: valuesMatch(app, paperText, property === "opacity" ? 0.02 : lengthTolerance),
        paper: paperText,
        property,
      },
    ];
  });
}

function readProperty(
  element: Element,
  style: CSSStyleDeclaration,
  box: DOMRect,
  property: MeasuredProperty,
) {
  switch (property) {
    case "backgroundColor":
      return toHex(style.backgroundColor);
    case "borderRadius":
      // `rounded-full` computes to a huge radius; the visible radius stops at half the short side.
      return `${round(Math.min(Number.parseFloat(style.borderTopLeftRadius), box.width / 2, box.height / 2))}px`;
    case "color":
      return toHex(style.color);
    case "edge":
      return readEdge(style);
    case "fontFamily":
      return /berkeley mono|monospace/i.test(style.fontFamily.split(",")[0] ?? "")
        ? "mono"
        : "sans";
    case "fontSize":
      return style.fontSize;
    case "fontWeight":
      return style.fontWeight;
    case "focusRing":
      return readFocusRing(style);
    case "height":
      return `${round(box.height)}px`;
    case "left":
      return `${round(box.left)}px`;
    case "letterSpacing":
      return style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    case "lineHeight":
      return style.lineHeight;
    case "opacity":
      return readOpacity(element);
    case "paddingLeft":
      return style.paddingLeft;
    case "paddingRight":
      return style.paddingRight;
    case "placeholderColor":
      return toHex(getComputedStyle(element, "::placeholder").color);
    case "width":
      return `${round(box.width)}px`;
  }
}

function readEdge(style: CSSStyleDeclaration) {
  const borderWidth = Number.parseFloat(style.borderTopWidth);

  if (style.borderTopStyle !== "none" && borderWidth > 0) {
    return `${round(borderWidth)}px ${toHex(style.borderTopColor)} (border)`;
  }

  const inset = parseShadows(style.boxShadow).find((shadow) => shadow.inset);

  if (inset) return `${round(inset.spread)}px ${toHex(inset.color)}`;

  return "none";
}

function readFocusRing(style: CSSStyleDeclaration) {
  if (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) {
    return `${round(Number.parseFloat(style.outlineWidth))}px ${toHex(style.outlineColor)} ${round(Number.parseFloat(style.outlineOffset))}px`;
  }

  const ring = parseShadows(style.boxShadow).find((shadow) => !shadow.inset && shadow.spread > 0);

  if (ring) return `${round(ring.spread)}px ${toHex(ring.color)} (box-shadow ring)`;

  return "none";
}

/** Effective opacity, including ancestors inside the specimen. */
function readOpacity(element: Element) {
  let opacity = 1;
  let current: Element | null = element;

  while (current && !current.hasAttribute("data-specimen-content")) {
    opacity *= Number.parseFloat(getComputedStyle(current).opacity);
    current = current.parentElement;
  }

  return String(round(opacity));
}

type Shadow = { color: string; inset: boolean; spread: number };

function parseShadows(value: string): Shadow[] {
  if (value === "none") return [];

  // Computed shadows read "<color> <x> <y> <blur> <spread> [inset]", comma separated outside parentheses.
  return value.split(/,(?![^(]*\))/).flatMap((shadow) => {
    const color = /^\s*((?:rgba?|oklch|oklab|color|lab|lch)\([^)]*\)|#[0-9a-f]+|\w+)/i.exec(shadow);
    const lengths = shadow.match(/-?[\d.]+px/g) ?? [];

    if (!color?.[1]) return [];

    const spread = Number.parseFloat(lengths[3] ?? "0");

    if (toHex(color[1]) === "transparent" || spread === 0) return [];

    return [{ color: color[1], inset: /\binset\b/.test(shadow), spread }];
  });
}

function valuesMatch(app: string, paper: string, tolerance: number) {
  if (app === paper) return true;

  const appParts = app.split(" ");
  const paperParts = paper.split(" ");

  if (appParts.length !== paperParts.length) return false;

  return appParts.every((part, index) => partsMatch(part, paperParts[index] ?? "", tolerance));
}

function partsMatch(app: string, paper: string, tolerance: number) {
  if (app === paper) return true;

  if (app.startsWith("#") && paper.startsWith("#")) return colorsMatch(app, paper);

  const appNumber = Number.parseFloat(app);
  const paperNumber = Number.parseFloat(paper);

  if (Number.isNaN(appNumber) || Number.isNaN(paperNumber)) return false;

  return Math.abs(appNumber - paperNumber) <= tolerance;
}

function colorsMatch(app: string, paper: string) {
  const appChannels = hexChannels(app);
  const paperChannels = hexChannels(paper);

  // Translucent colors lose precision when the canvas stores them premultiplied.
  const tolerance = (paperChannels[3] ?? 255) < 255 ? 10 : channelTolerance;

  return appChannels.every(
    (channel, index) =>
      Math.abs(channel - (paperChannels[index] ?? 0)) <= (index === 3 ? 6 : tolerance),
  );
}

function hexChannels(hex: string) {
  const digits = hex.slice(1).padEnd(8, "F");

  return [0, 2, 4, 6].map((start) => Number.parseInt(digits.slice(start, start + 2), 16));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
