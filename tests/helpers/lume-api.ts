import type { LumeApi } from "../../shared/lib";

export function createTestApi(createOverrides: () => Partial<LumeApi>): LumeApi {
  const rejectUnexpected = (operation: string) =>
    Promise.reject(new Error(`Unexpected ${operation} request`));

  return {
    addTrackToPlaylist: () => rejectUnexpected("addTrackToPlaylist"),
    addSource: () => rejectUnexpected("addSource"),
    confirmAddTrackToPlaylist: () => rejectUnexpected("confirmAddTrackToPlaylist"),
    createPlaylist: () => rejectUnexpected("createPlaylist"),
    createPlaylistFromTrack: () => rejectUnexpected("createPlaylistFromTrack"),
    deletePlaylist: () => rejectUnexpected("deletePlaylist"),
    disableSource: () => rejectUnexpected("disableSource"),
    enableSource: () => rejectUnexpected("enableSource"),
    forgetSource: () => rejectUnexpected("forgetSource"),
    loadLibrary: () => rejectUnexpected("loadLibrary"),
    loadPlaylist: () => rejectUnexpected("loadPlaylist"),
    playbackSession: {
      flush: () => {},
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
    },
    onLibraryUpdate: () => () => {},
    openDataFolder: () => rejectUnexpected("openDataFolder"),
    removePlaylistTrack: () => rejectUnexpected("removePlaylistTrack"),
    rescanSource: () => rejectUnexpected("rescanSource"),
    rescanSources: () => rejectUnexpected("rescanSources"),
    setTrackLiked: () => rejectUnexpected("setTrackLiked"),
    isMac: false,
    ...createOverrides(),
  };
}
