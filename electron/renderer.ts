import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  BrowserWindow,
  IpcMainInvokeEvent,
  net,
  protocol,
} from "electron";

const rendererScheme = "lume";
const packagedRendererUrl = `${rendererScheme}://app/index.html`;

export function registerRendererScheme(electronProtocol: typeof protocol) {
  electronProtocol.registerSchemesAsPrivileged([
    {
      scheme: rendererScheme,
      privileges: {
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export function getRendererUrl(
  isPackaged: boolean,
  developmentUrl: string | undefined,
) {
  if (!isPackaged && developmentUrl) return developmentUrl;
  return packagedRendererUrl;
}

export function handleRendererRequests(
  electronProtocol: typeof protocol,
  electronNet: typeof net,
  rendererDirectory: string,
) {
  electronProtocol.handle(rendererScheme, (request) => {
    const assetPath = getRendererAssetPath(rendererDirectory, request.url);

    if (!assetPath) return new Response(null, { status: 404 });
    return electronNet.fetch(pathToFileURL(assetPath).toString());
  });
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

  if (url.protocol !== `${rendererScheme}:` || url.host !== "app") return null;

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
