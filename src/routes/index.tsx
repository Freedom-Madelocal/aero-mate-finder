import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/pages/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Traceum" },
      { name: "description", content: "Real-time overview of composite material inventory, compliance, and orders." },
      { property: "og:title", content: "Dashboard — Traceum" },
      { property: "og:description", content: "Real-time overview of composite material inventory, compliance, and orders." },
    ],
  }),
  component: Dashboard,
});
