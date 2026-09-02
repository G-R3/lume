import { createFileRoute } from "@tanstack/react-router";
import { TracksPage } from "@/pages/tracks";

export const Route = createFileRoute("/_app/")({
  component: TracksPage,
});
