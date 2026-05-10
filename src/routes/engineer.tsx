import { createFileRoute } from "@tanstack/react-router";
import Engineer from "@/pages/Engineer";

export const Route = createFileRoute("/engineer")({
  head: () => ({
    meta: [
      { title: "Engineer Workspace — Traceum" },
      { name: "description", content: "Find materials matching engineering requirements." },
      { property: "og:title", content: "Engineer Workspace — Traceum" },
      { property: "og:description", content: "Find materials matching engineering requirements." },
    ],
  }),
  component: Engineer,
});
