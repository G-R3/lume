import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  net,
  protocol,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";

export const appScheme = "lume";
export const packagedRendererUrl = `${appScheme}://app/index.html`;

export function registerProtocolHandler(
  rendererDirectory: string,
  getTracks: () => ReadonlyMap<string, string>,
) {
  protocol.handle(appScheme, (request) => {
    const trackRequest = resolveTrackRequest(request.url, getTracks());

    if (trackRequest) {
      if (!trackRequest.path) return new Response(null, { status: 404 });
      return net.fetch(pathToFileURL(trackRequest.path).toString(), {
        headers: request.headers,
        method: request.method,
      });
    }

    const assetPath = getRendererAssetPath(rendererDirectory, request.url);

    if (!assetPath) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(assetPath).toString());
  });
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

export function isTrustedRendererEvent(
  event: IpcMainInvokeEvent,
  rendererUrl: string,
) {
  return (
    event.senderFrame === event.sender.mainFrame &&
    isTrustedRendererUrl(rendererUrl, event.senderFrame.url)
  );
}

export function isTrustedRendererUrl(
  rendererUrl: string,
  candidateUrl: string,
) {
  if (!URL.canParse(rendererUrl) || !URL.canParse(candidateUrl)) return false;

  const trustedUrl = new URL(rendererUrl);
  const candidate = new URL(candidateUrl);

  return (
    candidate.protocol === trustedUrl.protocol &&
    candidate.host === trustedUrl.host &&
    candidate.pathname === trustedUrl.pathname
  );
}

export function getRendererAssetPath(
  rendererDirectory: string,
  requestUrl: string,
) {
  if (!URL.canParse(requestUrl)) return null;

  const url = new URL(requestUrl);

  if (url.protocol !== `${appScheme}:` || url.host !== "app") return null;

  try {
    const assetPath = resolve(
      rendererDirectory,
      decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html",
    );
    const relativePath = relative(rendererDirectory, assetPath);

    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      return null;
    }

    return assetPath;
  } catch {
    return null;
  }
}

export function resolveTrackRequest(
  url: string,
  tracks: ReadonlyMap<string, string>,
) {
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
      path:
        tracks.get(
          decodeURIComponent(parsedUrl.pathname.slice("/media/".length)),
        ) ?? null,
    };
  } catch {
    return { path: null };
  }
}
