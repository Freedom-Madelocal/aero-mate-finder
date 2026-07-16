import { createFileRoute } from "@tanstack/react-router";
import EmbedCrossover from "@/pages/EmbedCrossover";

export const Route = createFileRoute("/embed/crossover")({
  head: () => ({
    meta: [
      { title: "Crossover Widget" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedCrossover,
});
