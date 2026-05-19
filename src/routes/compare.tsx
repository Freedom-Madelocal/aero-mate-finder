import { createFileRoute } from "@tanstack/react-router";
import Compare from "@/pages/Compare";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare — Traceium" },
      { name: "description", content: "Side-by-side technical comparison of aerospace materials." },
      { property: "og:title", content: "Compare — Traceium" },
      { property: "og:description", content: "Side-by-side technical comparison of aerospace materials." },
    ],
  }),
  component: Compare,
});
