import { createFileRoute } from "@tanstack/react-router";
import Orders from "@/pages/Orders";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Traceum" },
      { name: "description", content: "Customer orders, allocations, and shipments." },
      { property: "og:title", content: "Orders — Traceum" },
      { property: "og:description", content: "Customer orders, allocations, and shipments." },
    ],
  }),
  component: Orders,
});
