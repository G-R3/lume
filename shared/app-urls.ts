import { DatabaseIdSchema } from "./schemas";

export const APP_SCHEME = "lume";

const APP_HOST = "app";

const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const TRACK_PATH_PREFIX = "/media/";

const ARTWORK_PATH_PREFIX = "/artwork/";

export const PACKAGED_RENDERER_URL = `${APP_ORIGIN}/index.html`;

export function getTrackUrl(id: number) {
  return `${APP_ORIGIN}${TRACK_PATH_PREFIX}${encodeURIComponent(id)}`;
}

export function getArtworkUrl(id: string) {
  return `${APP_ORIGIN}${ARTWORK_PATH_PREFIX}${encodeURIComponent(id)}`;
}

export type AppUrl =
  | { kind: "track"; trackId: number | null }
  | { kind: "artwork"; artworkId: string | null }
  | { kind: "asset"; path: string | null };

export function parseAppUrl(url: string): AppUrl | null {
  if (!URL.canParse(url)) return null;

  const { host, pathname, protocol } = new URL(url);

  if (protocol !== `${APP_SCHEME}:` || host !== APP_HOST) return null;

  if (pathname.startsWith(TRACK_PATH_PREFIX)) {
    const trackId = Number(decodePathPart(pathname.slice(TRACK_PATH_PREFIX.length)) ?? Number.NaN);

    return {
      kind: "track",
      trackId: DatabaseIdSchema.safeParse(trackId).success ? trackId : null,
    };
  }

  if (pathname.startsWith(ARTWORK_PATH_PREFIX)) {
    return {
      kind: "artwork",
      artworkId: decodePathPart(pathname.slice(ARTWORK_PATH_PREFIX.length)),
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
