import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import "./index.css";
import {
  ToastList,
  ToastPortal,
  ToastProvider,
  ToastViewport,
  toast,
} from "@/components/ui/toast";
import { PlaybackProvider } from "@/hooks/use-playback";
import { trackFocusModality } from "@/lib/focus-modality";
import { createAppRouter } from "@/router";

trackFocusModality();

const queryClient = new QueryClient();

const router = createAppRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <PlaybackProvider>
          <RouterProvider router={router} />
          <ToastProvider toastManager={toast}>
            <ToastPortal>
              <ToastViewport className="transition-transform duration-200 ease-spring-exit motion-reduce:transition-none [&:not(:has([data-slot=toast]))]:transition-none [:root[data-toasts-lifted]_&]:-translate-y-(--toast-lift) [:root[data-toasts-lifted]_&]:duration-300 [:root[data-toasts-lifted]_&]:ease-spring-ui">
                <ToastList />
              </ToastViewport>
            </ToastPortal>
          </ToastProvider>
        </PlaybackProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
