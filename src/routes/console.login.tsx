import { createFileRoute } from "@tanstack/react-router";
import ConsoleLogin from "@/pages/ConsoleLogin";
export const Route = createFileRoute("/console/login")({
  head: () => ({ meta: [{ title: "traceium :: privileged login" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ConsoleLogin,
});
