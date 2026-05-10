import { createFileRoute } from "@tanstack/react-router";
import MaterialDetail from "@/pages/MaterialDetail";

export const Route = createFileRoute("/material/$id")({
  head: () => ({
    meta: [
      { title: "Material — Traceum" },
      { name: "description", content: "Material detail with lots, COA, COC, and lifecycle." },
      { property: "og:title", content: "Material — Traceum" },
      { property: "og:description", content: "Material detail with lots, COA, COC, and lifecycle." },
    ],
  }),
  component: MaterialDetail,
});
