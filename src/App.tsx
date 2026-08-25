import { useState } from "react";
import type { Track } from "../shared/lib";

function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [status, setStatus] = useState<"idle" | "choosing" | "scanning">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chooseMusicFolder = async () => {
    setStatus("choosing");
    try {
      const folder = await window.lume.chooseMusicFolder();

      if (!folder) return;

      setFolder(folder);
      setTracks([]);
      setSelectedTrackId("");
      setErrorMessage(null);
      setStatus("scanning");
      const tracks = await window.lume.scanLibrary();

      setTracks(tracks);
      setSelectedTrackId(tracks[0]?.id ?? "");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Library scan failed",
      );
    } finally {
      setStatus("idle");
    }
  };

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId);

  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <h1 className="text-xl font-semibold tracking-tight">Hello, world!</h1>
      <button
        disabled={status !== "idle"}
        onClick={chooseMusicFolder}
        type="button"
      >
        {status === "choosing"
          ? "Choosing Folder..."
          : status === "scanning"
            ? "Scanning Library..."
            : "Choose Music Folder"}
      </button>
      {folder && <p>Selected folder: {folder}</p>}
      {folder && status !== "scanning" && (
        <p>
          Found {tracks.length} audio {tracks.length === 1 ? "file" : "files"}
        </p>
      )}
      {errorMessage && <p role="alert">{errorMessage}</p>}

      {tracks.length > 0 && (
        <>
          <select
            aria-label="Audio file"
            onChange={(event) => setSelectedTrackId(event.target.value)}
            value={selectedTrackId}
          >
            {tracks.map((track) => (
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
