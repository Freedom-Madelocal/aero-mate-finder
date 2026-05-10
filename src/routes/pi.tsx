import { createFileRoute } from "@tanstack/react-router";
import NetSequence from "@/pages/NetSequence";

export const Route = createFileRoute("/pi")({
  head: () => ({
    meta: [
      { title: "·" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: NetSequence,
});
