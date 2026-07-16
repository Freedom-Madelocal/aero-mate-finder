import { createFileRoute } from "@tanstack/react-router";
import WidgetClientsAdmin from "@/pages/admin/WidgetClients";
export const Route = createFileRoute("/admin/widget-clients")({
  head: () => ({
    meta: [{ title: "Widget Clients — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: WidgetClientsAdmin,
});
