import { createFileRoute } from "@tanstack/react-router";
import AiUsage from "@/pages/admin/AiUsage";
export const Route = createFileRoute("/admin/ai-usage")({
  head: () => ({ meta: [{ title: "AI Usage — Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiUsage,
});
