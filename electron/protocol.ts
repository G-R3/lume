import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { net, protocol, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { appScheme, parseAppUrl } from "@shared/app-urls";
import { getArtworkData, getTrackPath, type ArtworkData } from "./library";
import { audioContentTypes } from "./library-files";

export function registerProtocolHandler(rendererDirectory: string) {
  protocol.handle(appScheme, async (request) => {
    const appUrl = parseAppUrl(request.url);

    if (appUrl?.kind === "track") {
      const trackPath = appUrl.trackId === null ? null : getTrackPath(appUrl.trackId);

      if (!trackPath) return new Response(null, { status: 404 });

      return createTrackResponse(trackPath, request);
    }

    if (appUrl?.kind === "artwork") {
      return createArtworkResponse(
        appUrl.artworkId === null ? null : getArtworkData(appUrl.artworkId),
      );
    }

    const assetPath =
      appUrl?.kind === "asset" ? getRendererAssetPath(rendererDirectory, appUrl.path) : null;

    if (!assetPath) return new Response(null, { status: 404 });

    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

export function createArtworkResponse(artwork: ArtworkData | null) {
  if (!artwork) return new Response(null, { status: 404 });

  return new Response(artwork.data, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(artwork.data.byteLength),
      "Content-Type": artwork.mediaType,
    },
  });
}

export async function createTrackResponse(path: string, request: Request) {
  const file = await stat(path).catch((error) => {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    )
      return null;

    throw error;
  });

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

export function getRendererAssetPath(rendererDirectory: string, path: string | null) {
  if (path === null) return null;

  const assetPath = resolve(rendererDirectory, path.replace(/^\/+/, "") || "index.html");
  const relativePath = relative(rendererDirectory, assetPath);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return null;
  }

  return assetPath;
}
