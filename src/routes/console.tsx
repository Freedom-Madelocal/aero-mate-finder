import { createFileRoute } from "@tanstack/react-router";
import Console from "@/pages/Console";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "traceium :: console" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Console,
});
