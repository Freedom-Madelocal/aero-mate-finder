import { createFileRoute } from "@tanstack/react-router";
import { verifyWidgetKey, corsHeaders } from "@/lib/widgetAuth.server";

export const Route = createFileRoute("/api/public/widget/config")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      GET: async ({ request }) => {
        const cors = corsHeaders(request.headers.get("origin"));
        const result = await verifyWidgetKey(request);
        if ("error" in result) {
          const r = result.error!;
          const merged = new Headers(r.headers);
          Object.entries(cors).forEach(([k, v]) => merged.set(k, v));
          return new Response(r.body, { status: r.status, headers: merged });
        }

        const c = result.client;
        return Response.json(
          {
            brand_name: c.brand_name,
            logo_url: c.logo_url,
            accent_color: c.accent_color,
          },
          { headers: cors },
        );
      },
    },
  },
});
