import { createFileRoute } from "@tanstack/react-router";
import Login from "@/pages/Login";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Traceum" },
      { name: "description", content: "Sign in to Traceum." },
      { property: "og:title", content: "Sign in — Traceum" },
      { property: "og:description", content: "Sign in to Traceum." },
    ],
  }),
  component: Login,
});
