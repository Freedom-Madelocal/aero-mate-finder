import { createFileRoute } from "@tanstack/react-router";
import Invite from "@/pages/Invite";
export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept invitation — Traceium" }, { name: "robots", content: "noindex" }] }),
  component: Invite,
});
