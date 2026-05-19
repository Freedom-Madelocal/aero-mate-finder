import { createFileRoute } from "@tanstack/react-router";
import MasterSpecs from "@/pages/MasterSpecs";
export const Route = createFileRoute("/admin/master-specs")({
  head: () => ({ meta: [{ title: "Master Specs — Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: MasterSpecs,
});
