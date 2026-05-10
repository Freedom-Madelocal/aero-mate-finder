import { createFileRoute } from "@tanstack/react-router";
import AdminUsers from "@/pages/admin/Users";
export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminUsers,
});
