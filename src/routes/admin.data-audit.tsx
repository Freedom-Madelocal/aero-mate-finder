import { createFileRoute } from "@tanstack/react-router";
import DataAudit from "@/pages/admin/DataAudit";

export const Route = createFileRoute("/admin/data-audit")({
  head: () => ({
    meta: [
      { title: "Data Audit — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DataAudit,
});
