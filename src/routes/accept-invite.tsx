import { createFileRoute } from "@tanstack/react-router";
import AcceptInvite from "@/pages/AcceptInvite";

export const Route = createFileRoute("/accept-invite")({
  head: () => ({
    meta: [
      { title: "Accept invitation — Traceium" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptInvite,
});
