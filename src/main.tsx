import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import "./index.css";
import { Toaster } from "@/components/ui/toast";
import { PlaybackProvider } from "@/hooks/use-playback";
import { createAppRouter } from "@/router";

const queryClient = new QueryClient();

const router = createAppRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <PlaybackProvider>
          <RouterProvider router={router} />
          <Toaster />
        </PlaybackProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
