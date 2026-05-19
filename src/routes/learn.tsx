import { createFileRoute } from "@tanstack/react-router";
import Learn from "@/pages/Learn";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn — Traceium" },
      { name: "description", content: "Technical guides, glossaries, and application deep-dives for aerospace engineers." },
      { property: "og:title", content: "Learn — Traceium" },
      { property: "og:description", content: "Technical guides, glossaries, and application deep-dives for aerospace engineers." },
    ],
  }),
  component: Learn,
});
