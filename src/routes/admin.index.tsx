import { createFileRoute } from "@tanstack/react-router";
import AdminHome from "@/pages/admin/AdminHome";
export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin Console" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminHome,
});
