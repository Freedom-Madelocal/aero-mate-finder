import { createFileRoute } from "@tanstack/react-router";
import ScrapeLogsPage from "@/pages/admin/ScrapeLogs";

export const Route = createFileRoute("/admin/scrape-logs")({
  head: () => ({
    meta: [
      { title: "Scrape Logs — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ScrapeLogsPage,
});
