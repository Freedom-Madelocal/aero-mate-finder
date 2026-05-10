import { createFileRoute } from "@tanstack/react-router";
import DemoExpired from "@/pages/DemoExpired";
export const Route = createFileRoute("/demo-expired")({
  head: () => ({ meta: [{ title: "Demo expired — Traceium" }, { name: "robots", content: "noindex" }] }),
  component: DemoExpired,
});
