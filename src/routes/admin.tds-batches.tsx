import { createFileRoute } from "@tanstack/react-router";
import AdminTdsBatches from "@/pages/admin/AdminTdsBatches";

export const Route = createFileRoute("/admin/tds-batches")({
  head: () => ({
    meta: [{ title: "TDS Batch Console" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AdminTdsBatches,
});
