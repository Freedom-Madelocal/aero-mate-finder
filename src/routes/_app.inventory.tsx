import { createFileRoute } from "@tanstack/react-router";
import Inventory from "@/pages/Inventory";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Traceum" },
      { name: "description", content: "Lot-level inventory of aerospace composite materials." },
      { property: "og:title", content: "Inventory — Traceum" },
      { property: "og:description", content: "Lot-level inventory of aerospace composite materials." },
    ],
  }),
  component: Inventory,
});
