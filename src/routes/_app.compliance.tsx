import { createFileRoute } from "@tanstack/react-router";
import Compliance from "@/pages/Compliance";

export const Route = createFileRoute("/_app/compliance")({
  head: () => ({
    meta: [
      { title: "Compliance — Traceum" },
      { name: "description", content: "TSM compliance tracking, freezer life, and out-time." },
      { property: "og:title", content: "Compliance — Traceum" },
      { property: "og:description", content: "TSM compliance tracking, freezer life, and out-time." },
    ],
  }),
  component: Compliance,
});
