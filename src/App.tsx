import { useState } from "react";

const tracks = Object.entries(
  import.meta.glob<string>("../tracks/*.mp3", {
    eager: true,
    import: "default",
    query: "?url",
  }),
)
  .map(([path, url]) => ({
    name: path.split("/").at(-1)?.replace(/\.mp3$/, "") ?? path,
    url,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

function App() {
  const [selectedTrack, setSelectedTrack] = useState(tracks[0]?.url ?? "");

  return (
    <main className="min-h-screen bg-black px-6 py-5 text-white">
      <h1 className="text-xl font-semibold tracking-tight">Lume</h1>

      <section className="mt-8 flex max-w-md flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm">Track</span>
          <select
            className="rounded border border-white/30 bg-black px-3 py-2"
            value={selectedTrack}
            onChange={(event) => setSelectedTrack(event.target.value)}
          >
            {tracks.map((track) => (
              <option key={track.url} value={track.url}>
                {track.name}
              </option>
            ))}
          </select>
        </label>

        {selectedTrack && <audio controls src={selectedTrack} />}
      </section>
    </main>
  );
}

export default App;
