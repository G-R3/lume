import { useState } from "react";
import type { MusicLibrary } from "../shared/lib";
import { Button } from "@/components/ui/button";

function App() {
  const [library, setLibrary] = useState<MusicLibrary | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chooseMusicFolder = async () => {
    setIsLoadingLibrary(true);
    setErrorMessage(null);

    try {
      const library = await window.lume.chooseMusicFolder();

      if (!library) return;

      setLibrary(library);
      setSelectedTrackId(library.tracks[0]?.id ?? "");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Library scan failed",
      );
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const selectedTrack = library?.tracks.find(
    (track) => track.id === selectedTrackId,
  );

  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <h1 className="text-xl font-semibold tracking-tight">Hello, world!</h1>
      <Button
        disabled={isLoadingLibrary}
        onClick={chooseMusicFolder}
        type="button"
      >
        {isLoadingLibrary ? "Loading Music Folder..." : "Choose Music Folder"}
      </Button>
      {library && <p>Selected folder: {library.folder}</p>}
      {library && (
        <p>
          Found {library.tracks.length} audio{" "}
          {library.tracks.length === 1 ? "file" : "files"}
        </p>
      )}
      {errorMessage && <p role="alert">{errorMessage}</p>}

      {library && library.tracks.length > 0 && (
        <>
          <select
            aria-label="Audio file"
            onChange={(event) => setSelectedTrackId(event.target.value)}
            value={selectedTrackId}
          >
            {library.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
          {selectedTrack && <audio controls src={selectedTrack.url} />}
        </>
      )}
    </main>
  );
}

export default App;
