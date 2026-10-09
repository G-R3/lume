// Attaches to the instance started by scripts/sandbox/start.ts and measures it.
//
//   pnpm sandbox:measure states   Opens the states page, forces hover and focus states through the
//                                 DevTools protocol, compares every specimen with Paper and writes a
//                                 drift report with screenshots of each specimen that differs.
//   pnpm sandbox:measure app      Visits each screen and lists every rendered color that is not a
//                                 role token, every font family and every size under 12px.
//
// Reports go to artifacts/sandbox-reports/<time>/ (git-ignored). Pass --out <dir> to change it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type CDPSession, chromium, type Locator, type Page } from "playwright";
import type { SpecimenResult } from "../../src/states/measure";
import { stateFile } from "./paths";

declare global {
  interface Window {
    lumeStates?: { measure: () => SpecimenResult[] };
  }
}

type SandboxState = {
  cdpUrl: string;
  profile: string;
  rendererUrl: string | null;
  statesUrl: string | null;
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" } },
});

const mode = positionals[0] ?? "states";

if (mode !== "states" && mode !== "app") throw new Error(`Unknown mode "${mode}"`);

// SAFETY: start.ts writes this file from a SandboxState value and deletes it on exit.
const state = JSON.parse(await readFile(stateFile, "utf8")) as SandboxState;

const outDirectory =
  values.out ?? join("artifacts", "sandbox-reports", new Date().toISOString().replaceAll(":", "-"));

await mkdir(outDirectory, { recursive: true });

const browser = await chromium.connectOverCDP(state.cdpUrl);

try {
  const page = browser.contexts()[0]?.pages()[0];

  if (!page) throw new Error("The sandbox has no window");

  const appUrl = page.url();
  await page.setViewportSize({ height: 800, width: 1280 });

  if (mode === "states") await measureStates(page);
  else await auditApp(page, appUrl);

  await page.goto(appUrl);
  console.log(`Report: ${outDirectory}`);
} finally {
  // Disconnects without closing the sandbox's window.
  await browser.close();
}

async function measureStates(page: Page) {
  if (!state.statesUrl)
    throw new Error("The states page needs the dev renderer (start without --built)");

  await page.goto(state.statesUrl);
  await page.waitForFunction(() => window.lumeStates !== undefined);
  await page.evaluate(() => document.fonts.ready);

  const cdp = await page.context().newCDPSession(page);
  const forced = await forceStates(cdp);
  // Let hover and focus transitions finish, so the colors read are the end state.
  await page.waitForTimeout(600);
  const results = await page.evaluate(() => window.lumeStates?.measure() ?? []);
  await page.screenshot({ fullPage: true, path: join(outDirectory, "states.png") });

  const drifting = results.filter((result) =>
    result.parts.some((part) => part.missing || part.checks.some((check) => !check.matches)),
  );

  for (const result of drifting) {
    await page
      .locator(`[data-specimen="${result.id}"] > div:nth-child(2)`)
      .screenshot({ path: join(outDirectory, `${result.id}.png`) });
  }

  await writeFile(join(outDirectory, "states.json"), JSON.stringify(results, null, 2));
  await writeFile(join(outDirectory, "states.md"), formatStatesReport(results, forced));
  await cdp.detach();
}

/** Applies each specimen's `data-force-states` to the element its `data-force-selector` matches. */
async function forceStates(cdp: CDPSession) {
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");

  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });

  const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: "[data-force-states]",
  });

  const forced: string[] = [];

  for (const specimen of nodeIds) {
    const { attributes } = await cdp.send("DOM.getAttributes", { nodeId: specimen });
    const attribute = (name: string) => attributes[attributes.indexOf(name) + 1] ?? "";
    const selector = attribute("data-force-selector");
    const states = attribute("data-force-states").split(" ");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: specimen, selector });

    if (nodeId === 0) continue;

    await cdp.send("CSS.forcePseudoState", { forcedPseudoClasses: states, nodeId });
    forced.push(`${attribute("data-specimen")}: :${states.join(", :")} on \`${selector}\``);
  }

  return forced;
}

function formatStatesReport(results: readonly SpecimenResult[], forced: readonly string[]) {
  const lines = ["# States page vs Paper", "", `Measured ${new Date().toISOString()}.`, ""];
  let checked = 0;
  let differing = 0;

  for (const result of results) {
    for (const part of result.parts) {
      if (part.missing) {
        differing += 1;
        lines.push(`- FAIL ${result.id} · ${part.name}: element not found`);
        continue;
      }

      for (const check of part.checks) {
        checked += 1;

        if (check.matches) continue;

        differing += 1;
        lines.push(
          `- FAIL ${result.id} · ${part.name} · ${check.property}: app ${check.app}, Paper ${check.paper}`,
        );
      }
    }
  }

  lines.splice(3, 0, `${differing} of ${checked} checks differ.`, "");
  lines.push("", "## Forced states", "", ...forced.map((line) => `- ${line}`), "");

  return lines.join("\n");
}

type ScreenAudit = {
  colors: { count: number; example: string; property: string; tokens: string[]; value: string }[];
  fonts: { count: number; family: string }[];
  smallText: { count: number; example: string; size: string }[];
};

async function auditApp(page: Page, appUrl: string) {
  const base = appUrl.split("#")[0] ?? appUrl;

  const screens: readonly {
    double?: boolean;
    hash: string;
    name: string;
    open?: (page: Page) => Locator;
  }[] = [
    { hash: "#/", name: "tracks" },
    { hash: "#/playlists/1", name: "playlist" },
    { hash: "#/settings", name: "settings" },
    {
      hash: "#/",
      name: "create-playlist-dialog",
      open: (page) => page.getByRole("button", { name: "Create playlist" }).first(),
    },
    {
      hash: "#/",
      name: "track-menu",
      open: (page) => page.locator('tbody button[aria-label^="More options for"]').first(),
    },
    {
      // Double-clicking a row selects and plays it, which shows the player bar and the playing row.
      double: true,
      hash: "#/",
      name: "playing",
      open: (page) => page.locator("tbody tr:first-child").first(),
    },
    {
      hash: "#/",
      name: "playlist-menu",
      open: (page) => page.locator('[data-sidebar="menu-action"]').first(),
    },
  ];

  const report: string[] = [
    "# App color and type audit",
    "",
    `Measured ${new Date().toISOString()}.`,
    "",
  ];

  for (const screen of screens) {
    // A reload resets scroll positions and open overlays left by the previous screen.
    await page.goto(`${base}${screen.hash}`);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    if (screen.open) {
      const target = screen.open(page);
      await target.hover();
      await (screen.double ? target.dblclick() : target.click());
      await page.waitForTimeout(300);
    }

    const audit = await page.evaluate(collectAudit);
    await page.screenshot({ path: join(outDirectory, `${screen.name}.png`) });
    await page.keyboard.press("Escape");
    report.push(...formatAudit(screen.name, audit));
  }

  await writeFile(join(outDirectory, "app.md"), report.join("\n"));
}

function formatAudit(name: string, audit: ScreenAudit) {
  const offToken = audit.colors.filter((color) => color.tokens.length === 0);

  return [
    `## ${name}`,
    "",
    `Colors: ${audit.colors.length} distinct, ${offToken.length} not a token.`,
    "",
    ...offToken.map(
      (color) => `- FAIL ${color.property} ${color.value} ×${color.count}, e.g. ${color.example}`,
    ),
    ...audit.colors
      .filter((color) => color.tokens.length > 0)
      .map(
        (color) =>
          `- pass ${color.property} ${color.value} ×${color.count} = ${color.tokens.slice(0, 3).join(", ")}`,
      ),
    "",
    `Fonts: ${audit.fonts.map((font) => `${font.family} ×${font.count}`).join(", ")}`,
    "",
    `Text under 12px: ${audit.smallText.length === 0 ? "none" : `${audit.smallText.length} sizes`}`,
    ...audit.smallText.map((text) => `- ${text.size} ×${text.count}, e.g. ${text.example}`),
    "",
  ];
}

/** Runs in the page. Self-contained, because Playwright serializes it. */
function collectAudit(): ScreenAudit {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  const toHex = (color: string) => {
    if (!context) return color;

    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);

    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;

    if (alpha === 0) return "transparent";

    const hex = [red, green, blue, ...(alpha === 255 ? [] : [alpha])]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("");

    return `#${hex}`.toUpperCase();
  };

  // Translucent colors lose precision when the canvas stores them premultiplied.
  const sameColor = (left: string, right: string) => {
    if (left === right) return true;

    if (!left.startsWith("#") || !right.startsWith("#") || left.length !== right.length)
      return false;

    const tolerance = left.length === 9 ? 10 : 2;

    return [1, 3, 5, 7].every(
      (start) =>
        start >= left.length ||
        Math.abs(
          Number.parseInt(left.slice(start, start + 2), 16) -
            Number.parseInt(right.slice(start, start + 2), 16),
        ) <= tolerance,
    );
  };

  const rootStyle = getComputedStyle(document.documentElement);

  // Computed styles list custom properties too, wherever the stylesheet defines them.
  const tokenNames = Array.from(rootStyle).filter(
    (name) => name.startsWith("--color-") || name === "--accent-root",
  );

  // Roles first, so a value shared by a role and a primitive lists the role.
  const tokens = tokenNames
    .sort((left, right) => Number(/-\d/.test(left)) - Number(/-\d/.test(right)))
    .map((name) => ({ hex: toHex(rootStyle.getPropertyValue(name).trim()), name }));

  const describe = (element: Element) => {
    const classes = element.getAttribute("class")?.slice(0, 60) ?? "";
    const text = element.textContent?.trim().slice(0, 30) ?? "";

    return `<${element.tagName.toLowerCase()} class="${classes}">${text}`;
  };

  const colors = new Map<string, ScreenAudit["colors"][number]>();
  const fonts = new Map<string, number>();
  const smallText = new Map<string, ScreenAudit["smallText"][number]>();

  const addColor = (property: string, value: string, element: Element) => {
    const hex = toHex(value);

    if (hex === "transparent") return;

    const key = `${property} ${hex}`;
    const entry = colors.get(key);

    if (entry) {
      entry.count += 1;

      return;
    }

    colors.set(key, {
      count: 1,
      example: describe(element),
      property,
      tokens: tokens.filter((token) => sameColor(token.hex, hex)).map((token) => token.name),
      value: hex,
    });
  };

  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    const box = element.getBoundingClientRect();

    if (box.width === 0 || box.height === 0) continue;

    const style = getComputedStyle(element);

    if (style.visibility === "hidden" || style.opacity === "0") continue;

    const hasText = Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    );

    if (hasText) {
      addColor("color", style.color, element);

      const family = style.fontFamily.split(",")[0]?.trim() ?? "";
      fonts.set(family, (fonts.get(family) ?? 0) + 1);

      if (Number.parseFloat(style.fontSize) < 12) {
        const entry = smallText.get(style.fontSize);

        if (entry) entry.count += 1;
        else
          smallText.set(style.fontSize, {
            count: 1,
            example: describe(element),
            size: style.fontSize,
          });
      }
    }

    addColor("background", style.backgroundColor, element);

    if (style.borderTopStyle !== "none" && Number.parseFloat(style.borderTopWidth) > 0) {
      addColor("border", style.borderTopColor, element);
    }

    if (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) {
      addColor("outline", style.outlineColor, element);
    }

    if (element instanceof SVGElement && style.fill !== "none")
      addColor("fill", style.fill, element);
  }

  return {
    colors: Array.from(colors.values()).sort((left, right) => right.count - left.count),
    fonts: Array.from(fonts, ([family, count]) => ({ count, family })),
    smallText: Array.from(smallText.values()),
  };
}
