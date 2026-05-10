import { createFileRoute } from "@tanstack/react-router";
import Landing from "@/pages/Landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Traceium — Aerospace materials, traced end-to-end" },
      {
        name: "description",
        content:
          "Engineer-first material intelligence and procurement for aerospace. Find any qualified spec in seconds. Aggregate buying. Audit-ready compliance.",
      },
      { property: "og:title", content: "Traceium — Trace the data. Build the future." },
      {
        property: "og:description",
        content:
          "The complexity of aerospace is staggering. Traceium turns the sea of specs, certs, and lots into the answer your engineer or buyer actually needed.",
      },
    ],
  }),
  component: Landing,
});
