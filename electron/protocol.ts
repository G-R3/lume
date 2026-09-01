import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { net, protocol, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { audioContentTypes } from "./library";

export const appScheme = "lume";
export const packagedRendererUrl = `${appScheme}://app/index.html`;

export function registerProtocolHandler(
  rendererDirectory: string,
  getTrackPath: (trackId: string) => string | null,
) {
  protocol.handle(appScheme, async (request) => {
    const trackRequest = resolveTrackRequest(request.url, getTrackPath);

    if (trackRequest) {
      if (!trackRequest.path) return new Response(null, { status: 404 });
      return createTrackResponse(trackRequest.path, request);
    }

    const assetPath = getRendererAssetPath(rendererDirectory, request.url);

    if (!assetPath) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

export async function createTrackResponse(path: string, request: Request) {
  // Tracks can disappear after scanning. For now, we treat every stat failure as a missing file.
  const file = await stat(path).catch(() => null);

  if (!file?.isFile()) return new Response(null, { status: 404 });

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type":
      audioContentTypes.get(extname(path).toLowerCase()) ?? "application/octet-stream",
  });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader === null ? null : parseByteRange(rangeHeader, file.size);

  if (rangeHeader !== null && !range) {
    headers.set("Content-Range", `bytes */${file.size}`);
    return new Response(null, { headers, status: 416 });
  }

  if (!range) {
    headers.set("Content-Length", String(file.size));
    return new Response(Readable.toWeb(createReadStream(path)), { headers });
  }

  headers.set("Content-Length", String(range.end - range.start + 1));
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);

  return new Response(Readable.toWeb(createReadStream(path, range)), {
    headers,
    status: 206,
  });
}

function parseByteRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

  if (!match || size === 0 || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const length = Number(match[2]);

    if (!Number.isSafeInteger(length) || length <= 0) return null;
    return { start: Math.max(size - length, 0), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}

export function getTrackUrl(id: string) {
  return `${appScheme}://app/media/${encodeURIComponent(id)}`;
}

export function loadRenderer(window: BrowserWindow, rendererUrl: string) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(rendererUrl, url)) return;
    event.preventDefault();
  });

  void window.loadURL(rendererUrl);
}

export function isTrustedRendererEvent(event: IpcMainInvokeEvent, rendererUrl: string) {
  return (
    event.senderFrame === event.sender.mainFrame &&
    isTrustedRendererUrl(rendererUrl, event.senderFrame.url)
  );
}

export function isTrustedRendererUrl(rendererUrl: string, candidateUrl: string) {
  if (!URL.canParse(rendererUrl) || !URL.canParse(candidateUrl)) return false;

  const trustedUrl = new URL(rendererUrl);
  const candidate = new URL(candidateUrl);

  return (
    candidate.protocol === trustedUrl.protocol &&
    candidate.host === trustedUrl.host &&
    candidate.pathname === trustedUrl.pathname
  );
}

export function getRendererAssetPath(rendererDirectory: string, requestUrl: string) {
  if (!URL.canParse(requestUrl)) return null;

  const url = new URL(requestUrl);

  if (url.protocol !== `${appScheme}:` || url.host !== "app") return null;

  try {
    const assetPath = resolve(
      rendererDirectory,
      decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html",
    );
    const relativePath = relative(rendererDirectory, assetPath);

    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return null;
    }

    return assetPath;
  } catch {
    return null;
  }
}

export function resolveTrackRequest(url: string, getTrackPath: (trackId: string) => string | null) {
  if (!URL.canParse(url)) return null;

  const parsedUrl = new URL(url);

  if (
    parsedUrl.protocol !== `${appScheme}:` ||
    parsedUrl.host !== "app" ||
    !parsedUrl.pathname.startsWith("/media/")
  ) {
    return null;
  }

  try {
    return {
      path: getTrackPath(decodeURIComponent(parsedUrl.pathname.slice("/media/".length))),
    };
  } catch {
    return { path: null };
  }
}
