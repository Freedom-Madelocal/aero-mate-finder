import { createFileRoute } from "@tanstack/react-router";
import Settings from "@/pages/Settings";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Traceum" },
      { name: "description", content: "Account, organization, and notification settings." },
      { property: "og:title", content: "Settings — Traceum" },
      { property: "og:description", content: "Account, organization, and notification settings." },
    ],
  }),
  component: Settings,
});
