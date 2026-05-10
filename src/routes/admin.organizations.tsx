import { createFileRoute } from "@tanstack/react-router";
import AdminOrganizations from "@/pages/admin/Organizations";
export const Route = createFileRoute("/admin/organizations")({
  head: () => ({ meta: [{ title: "Organizations — Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminOrganizations,
});
