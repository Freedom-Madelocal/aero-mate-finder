import { createFileRoute } from "@tanstack/react-router";
import Engineer from "@/pages/Engineer";

interface EngineerSearch {
  spec?: string;
  q?: string;
}

export const Route = createFileRoute("/_app/engineer")({
  validateSearch: (search: Record<string, unknown>): EngineerSearch => ({
    spec: typeof search.spec === "string" ? search.spec : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Engineer Workspace — Traceum" },
      { name: "description", content: "Find materials matching engineering requirements." },
      { property: "og:title", content: "Engineer Workspace — Traceum" },
      { property: "og:description", content: "Find materials matching engineering requirements." },
    ],
  }),
  component: Engineer,
});
