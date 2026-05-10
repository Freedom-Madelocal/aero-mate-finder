import { createFileRoute } from "@tanstack/react-router";
import OrgTeam from "@/pages/OrgTeam";
export const Route = createFileRoute("/org/team")({
  head: () => ({ meta: [{ title: "Team — Traceium" }, { name: "robots", content: "noindex" }] }),
  component: OrgTeam,
});
