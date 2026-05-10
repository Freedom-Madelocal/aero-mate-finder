import { createFileRoute } from "@tanstack/react-router";
import ForgotPassword from "@/pages/ForgotPassword";
export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — Traceium" }, { name: "robots", content: "noindex" }] }),
  component: ForgotPassword,
});
