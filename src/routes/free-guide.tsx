import { createFileRoute } from "@tanstack/react-router";
import FreeGuide from "@/pages/FreeGuide";

export const Route = createFileRoute("/free-guide")({
  head: () => ({
    meta: [
      { title: "Free Aerospace Composites Guide — Traceium" },
      {
        name: "description",
        content:
          "Download Traceium's free guide for aerospace composites engineers. Enter your work email to get instant access.",
      },
      { property: "og:title", content: "Free Aerospace Composites Guide — Traceium" },
      {
        property: "og:description",
        content:
          "Practical shortcuts for aerospace composites engineers — free download from Traceium.",
      },
    ],
  }),
  component: FreeGuide,
});
