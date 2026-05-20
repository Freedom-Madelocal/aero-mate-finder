import { createFileRoute } from "@tanstack/react-router";
import Crossover from "@/pages/Crossover";

export const Route = createFileRoute("/_app/crossover")({
  head: () => ({
    meta: [
      { title: "Crossover — Traceium" },
      { name: "description", content: "Find functionally equivalent aerospace materials across manufacturers." },
      { property: "og:title", content: "Crossover — Traceium" },
      { property: "og:description", content: "Find functionally equivalent aerospace materials across manufacturers." },
    ],
  }),
  component: Crossover,
});
