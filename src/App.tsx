import { useEffect } from "react";

function App() {
  useEffect(() => {
    const ping = async () => {
      const pong = await window.lume.ping();
      console.log(pong);
    };

    void ping();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <h1 className="text-xl font-semibold tracking-tight">Hello, world!</h1>
    </main>
  );
}

export default App;
