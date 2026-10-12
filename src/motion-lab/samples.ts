import { parseWebStream, selectCover } from "music-metadata";
import { useEffect, useState } from "react";
import type { Track } from "../../shared/lib";

// Local audio in tracks-sample/ (git-ignored). Missing on other machines, which leaves this empty.
const files = import.meta.glob("/tracks-sample/*.{mp3,flac,m4a,wav,ogg}", {
  eager: true,
  import: "default",
  query: "?url",
});

export const loopUrl = "/tracks-sample/static_media_guitar-loop.33652f23.mp3";

const sampleUrls = Object.entries(files).flatMap(([path, url]) =>
  / copy\.|guitar-loop/.test(path) ? [] : [String(url)],
);

async function readSample(url: string, id: number): Promise<Track | null> {
  const controller = new AbortController();

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.body) return null;

    const size = Number(response.headers.get("content-length")) || undefined;

    const metadata = await parseWebStream(
      response.body,
      { mimeType: response.headers.get("content-type") ?? undefined, size },
      { duration: false },
    );

    const cover = selectCover(metadata.common.picture);
    const name = decodeURIComponent(url.split("/").pop() ?? "").replace(/\.[^.]+$/, "");

    const artists =
      metadata.common.artists ?? (metadata.common.artist ? [metadata.common.artist] : []);

    return {
      addedAt: Date.now(),
      album: metadata.common.album ?? "Unknown album",
      albumArtists: artists,
      artists: artists.length > 0 ? artists : ["Unknown artist"],
      artworkUrl: cover ? toDataUrl(cover.data, cover.format) : null,
      available: true,
      bitrate: metadata.format.bitrate ?? null,
      bitsPerSample: metadata.format.bitsPerSample ?? null,
      channelCount: metadata.format.numberOfChannels ?? null,
      codec: metadata.format.codec ?? null,
      discNumber: null,
      discTotal: null,
      duration: metadata.format.duration ?? null,
      format: (url.split(".").pop() ?? "").toUpperCase(),
      genres: [],
      id,
      likedAt: null,
      lossless: metadata.format.lossless ?? false,
      sampleRate: metadata.format.sampleRate ?? null,
      title: metadata.common.title ?? name,
      trackNumber: null,
      trackTotal: null,
      url,
      year: null,
    };
  } catch {
    return null;
  } finally {
    controller.abort();
  }
}

// The page's content security policy allows data: images but not blob: ones
function toDataUrl(data: Uint8Array, type: string) {
  let binary = "";

  for (let index = 0; index < data.length; index += 0x8000)
    binary += String.fromCharCode(...data.subarray(index, index + 0x8000));

  return `data:${type};base64,${btoa(binary)}`;
}

/** Reads each sample's tags, artwork and duration without downloading the whole file. */
export function useSampleTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(sampleUrls.map((url, index) => readSample(url, 1000 + index))).then((read) => {
      if (!cancelled) setTracks(read.filter((track): track is Track => track?.duration != null));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return tracks;
}
