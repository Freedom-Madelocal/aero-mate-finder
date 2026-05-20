import { createFileRoute } from "@tanstack/react-router";
import Documents from "@/pages/Documents";

export const Route = createFileRoute("/_app/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Traceum" },
      { name: "description", content: "COA, COC, and traceability documentation." },
      { property: "og:title", content: "Documents — Traceum" },
      { property: "og:description", content: "COA, COC, and traceability documentation." },
    ],
  }),
  component: Documents,
});
