import { createFileRoute } from "@tanstack/react-router";
import AdminCrm from "@/pages/admin/Crm";
export const Route = createFileRoute("/admin/crm")({
  head: () => ({ meta: [{ title: "CRM — Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminCrm,
});
