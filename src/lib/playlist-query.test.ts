import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vite-plus/test";
import type { PlaylistRead } from "../../shared/library";
import { playlistEffects } from "./playlist-events";
import { applyPlaylistRead, createPlaylistReader } from "./playlist-query";

it("reads again instead of failing when a commit that changes nothing lands during a read", async () => {
  const loads: ((read: PlaylistRead) => void)[] = [];
  const playlist = { description: null, id: 1, title: "Mix", tracks: [] };

  Object.assign(globalThis, {
    window: {
      lume: {
        loadPlaylist: () => new Promise<PlaylistRead>((resolve) => loads.push(resolve)),
      },
    },
  });

  const queryClient = new QueryClient();
  const read = createPlaylistReader(queryClient).read(1);
  await expect.poll(() => loads.length).toBe(1);

  applyPlaylistRead(
    queryClient,
    playlistEffects({
      kind: "playlist-tracks-added",
      playlistId: 1,
      revision: 5,
      trackCount: 0,
      tracks: [],
    }),
  );
  loads[0]({ playlist, revision: 4 });
  await expect.poll(() => loads.length).toBe(2);
  loads[1]({ playlist, revision: 5 });

  await expect(read).resolves.toEqual({ playlist, revision: 5 });
});
