import { createFileRoute } from "@tanstack/react-router";
import Suppliers from "@/pages/Suppliers";

export const Route = createFileRoute("/_app/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Traceum" },
      { name: "description", content: "Composite material supplier directory and lead times." },
      { property: "og:title", content: "Suppliers — Traceum" },
      { property: "og:description", content: "Composite material supplier directory and lead times." },
    ],
  }),
  component: Suppliers,
});
