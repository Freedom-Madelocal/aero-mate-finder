import { createFileRoute } from "@tanstack/react-router";
import TdsUpload from "@/pages/admin/TdsUpload";

export const Route = createFileRoute("/admin/tds-upload")({
  head: () => ({
    meta: [
      { title: "TDS Upload — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TdsUpload,
});
