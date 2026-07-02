import { createFileRoute } from "@tanstack/react-router";
import FeatureFlagsAdmin from "@/pages/admin/FeatureFlags";
export const Route = createFileRoute("/admin/feature-flags")({
  head: () => ({ meta: [{ title: "Feature Flags — Admin" }, { name: "robots", content: "noindex" }] }),
  component: FeatureFlagsAdmin,
});
