import { useEffect, useState } from "react";

export function useMinuteClock() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return now;
}
