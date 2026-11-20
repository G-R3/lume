import { databaseIdSchema } from "./schemas";

export const appScheme = "lume";

const appHost = "app";

const appOrigin = `${appScheme}://${appHost}`;

const trackPathPrefix = "/media/";

const artworkPathPrefix = "/artwork/";

export const packagedRendererUrl = `${appOrigin}/index.html`;

export function getTrackUrl(id: number) {
  return `${appOrigin}${trackPathPrefix}${encodeURIComponent(id)}`;
}

export function getArtworkUrl(id: string) {
  return `${appOrigin}${artworkPathPrefix}${encodeURIComponent(id)}`;
}

export type AppUrl =
  | { kind: "track"; trackId: number | null }
  | { kind: "artwork"; artworkId: string | null }
  | { kind: "asset"; path: string | null };

export function parseAppUrl(url: string): AppUrl | null {
  if (!URL.canParse(url)) return null;

  const { host, pathname, protocol } = new URL(url);

  if (protocol !== `${appScheme}:` || host !== appHost) return null;

  if (pathname.startsWith(trackPathPrefix)) {
    const trackId = Number(decodePathPart(pathname.slice(trackPathPrefix.length)) ?? Number.NaN);

    return {
      kind: "track",
      trackId: databaseIdSchema.safeParse(trackId).success ? trackId : null,
    };
  }

  if (pathname.startsWith(artworkPathPrefix)) {
    return {
      kind: "artwork",
      artworkId: decodePathPart(pathname.slice(artworkPathPrefix.length)),
    };
  }

  return { kind: "asset", path: decodePathPart(pathname) };
}

function decodePathPart(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}
