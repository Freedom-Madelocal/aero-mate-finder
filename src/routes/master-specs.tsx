import { createFileRoute } from "@tanstack/react-router";
import MasterSpecs from "@/pages/MasterSpecs";

export const Route = createFileRoute("/master-specs")({
  head: () => ({
    meta: [
      { title: "Master Spec List — Traceum" },
      {
        name: "description",
        content:
          "Canonical aerospace material spec catalog. Search by chemistry, cure, Tg, applications, and qualifications. See which products are stocked.",
      },
      { property: "og:title", content: "Master Spec List — Traceum" },
      {
        property: "og:description",
        content:
          "Canonical aerospace material spec catalog with vendor crossovers, outgassing, mechanical, and inventory linkage.",
      },
    ],
  }),
  component: MasterSpecs,
});
