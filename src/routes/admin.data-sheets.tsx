import { createFileRoute } from "@tanstack/react-router";
import DataSheetsAdminPage from "@/pages/admin/DataSheets";

export const Route = createFileRoute("/admin/data-sheets")({
  head: () => ({
    meta: [
      { title: "Data Sheets — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DataSheetsAdminPage,
});
