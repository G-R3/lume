import { useState } from "react";

function App() {
  const [folder, setFolder] = useState<string | null>(null);

  const selectFolder = async () => {
    const folder = await window.lume.selectFolder();

    setFolder(folder);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <h1 className="text-xl font-semibold tracking-tight">Hello, world!</h1>
      <button onClick={selectFolder}>Select Folder</button>
      {folder && <p>Selected folder: {folder}</p>}
    </main>
  );
}

export default App;
