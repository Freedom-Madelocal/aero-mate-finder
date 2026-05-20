import { createFileRoute } from "@tanstack/react-router";
import Crossover from "@/pages/Crossover";

interface CrossoverSearch {
  q?: string;
}

export const Route = createFileRoute("/_app/crossover")({
  validateSearch: (search: Record<string, unknown>): CrossoverSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
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
