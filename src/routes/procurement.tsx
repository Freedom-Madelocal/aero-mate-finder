import { createFileRoute } from "@tanstack/react-router";
import Procurement from "@/pages/Procurement";

export const Route = createFileRoute("/procurement")({
  head: () => ({
    meta: [
      { title: "Procurement — Traceum" },
      { name: "description", content: "Aggregate engineer pick lists and contact vendors for parts." },
    ],
  }),
  component: Procurement,
});
