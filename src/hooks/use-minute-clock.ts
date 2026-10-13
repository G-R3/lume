import { useEffect, useState } from "react";

/** The current time, updated every minute. */
export function useMinuteClock() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return now;
}
