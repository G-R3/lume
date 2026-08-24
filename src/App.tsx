import { useState } from "react";

function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [isChoosingFolder, setIsChoosingFolder] = useState(false);

  const chooseMusicFolder = async () => {
    setIsChoosingFolder(true);
    try {
      const folder = await window.lume.chooseMusicFolder();

      if (folder) setFolder(folder);
    } finally {
      setIsChoosingFolder(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <h1 className="text-xl font-semibold tracking-tight">Hello, world!</h1>
      <button
        disabled={isChoosingFolder}
        onClick={chooseMusicFolder}
        type="button"
      >
        {isChoosingFolder ? "Choosing Folder..." : "Choose Music Folder"}
      </button>
      {folder && <p>Selected folder: {folder}</p>}
    </main>
  );
}

export default App;
