import { createFileRoute } from "@tanstack/react-router";
import { verifyWidgetKey, corsHeaders } from "@/lib/widgetAuth.server";

export const Route = createFileRoute("/api/public/widget/catalog")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      GET: async ({ request }) => {
        const cors = corsHeaders(request.headers.get("origin"));
        const result = await verifyWidgetKey(request);
        if ("error" in result) {
          const r = result.error;
          const merged = new Headers(r.headers);
          Object.entries(cors).forEach(([k, v]) => merged.set(k, v));
          return new Response(r.body, { status: r.status, headers: merged });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("master_specs")
          .select(
            "id, vendor, product_name, product_family, material_category, resin_chemistry, product_form, cure_temperature_c, applications, profiles, crossover_product, key_specs",
          )
          .limit(5000);
        if (error) return new Response(error.message, { status: 500, headers: cors });

        const specs = (data ?? []).map((r: any) => ({
          id: r.id,
          vendor: r.vendor,
          productName: r.product_name,
          productFamily: r.product_family,
          materialCategory: r.material_category,
          resinChemistry: r.resin_chemistry,
          productForm: r.product_form,
          cureTemperatureC: r.cure_temperature_c,
          applications: r.applications,
          profiles: r.profiles,
          crossoverProduct: r.crossover_product,
          keySpecs: r.key_specs,
        }));

        return Response.json(
          { specs },
          {
            headers: {
              ...cors,
              "Cache-Control": "public, max-age=300",
            },
          },
        );
      },
    },
  },
});
