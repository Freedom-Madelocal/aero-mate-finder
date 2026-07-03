import { createFileRoute } from "@tanstack/react-router";
import LandingAdmin from "@/pages/admin/Landing";

export const Route = createFileRoute("/admin/landing")({
  head: () => ({
    meta: [
      { title: "Landing Page — Admin" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LandingAdmin,
});
