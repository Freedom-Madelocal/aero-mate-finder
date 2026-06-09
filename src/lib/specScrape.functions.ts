import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const FieldsSchema = z.object({
  cure_temperature_f: z.number().nullable(),
  cure_time: z.string().nullable(),
  dry_tg_onset_f: z.number().nullable(),
  wet_tg_f: z.number().nullable(),
  peak_tg_f: z.number().nullable(),
  max_service_temperature_f: z.number().nullable(),
  out_life_days: z.number().nullable(),
  freezer_life_months: z.number().nullable(),
  tml_pct: z.number().nullable(),
  cvcm_pct: z.number().nullable(),
  tensile_lap_shear_mpa: z.number().nullable(),
  t_peel_n_per_25mm: z.number().nullable(),
  flatwise_tension_mpa: z.number().nullable(),
  climbing_drum_peel_in_lb_per_in: z.number().nullable(),
  process_method: z.string().nullable(),
  resin_chemistry: z.string().nullable(),
  reinforcement: z.string().nullable(),
  product_form: z.string().nullable(),
  applications: z.string().nullable(),
  qualifications_standards: z.string().nullable(),
});

const ScrapeResponseSchema = z.object({
  url: z.string().nullable(),
  source_title: z.string().nullable(),
  found: z.boolean(),
  notes: z.string().nullable(),
  fields: FieldsSchema,
});

type ScrapeFields = z.infer<typeof FieldsSchema>;

// Field name in scrape response -> column name in master_specs
const FIELD_TO_COLUMN: Record<keyof ScrapeFields, string> = {
  cure_temperature_f: "cure_temperature_c",
  cure_time: "cure_time",
  dry_tg_onset_f: "dry_tg_onset_c",
  wet_tg_f: "wet_tg_c",
  peak_tg_f: "peak_tg_c",
  max_service_temperature_f: "max_service_temperature_c",
  out_life_days: "out_life_days",
  freezer_life_months: "freezer_life_months",
  tml_pct: "tml_pct",
  cvcm_pct: "cvcm_pct",
  tensile_lap_shear_mpa: "tensile_lap_shear_mpa",
  t_peel_n_per_25mm: "t_peel_n_per_25mm",
  flatwise_tension_mpa: "flatwise_tension_mpa",
  climbing_drum_peel_in_lb_per_in: "climbing_drum_peel_in_lb_per_in",
  process_method: "process_method",
  resin_chemistry: "resin_chemistry",
  reinforcement: "reinforcement",
  product_form: "product_form",
  applications: "applications",
  qualifications_standards: "qualifications_standards",
};

async function callGemini(vendor: string, productName: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const prompt = `You are helping populate a materials database with information from manufacturer Technical Data Sheets (TDS) or Product Data Sheets (PDS).

Find the official publicly accessible TDS or PDS for this material:
- Vendor / manufacturer: ${vendor}
- Product name: ${productName}

Search the manufacturer's official website. The result is the kind of page or PDF an engineer would find by Googling "${vendor} ${productName} TDS".

Return STRICT JSON matching this schema:
{
  "found": boolean,
  "url": string | null,         // direct URL to the TDS/PDS PDF or product page
  "source_title": string | null, // short title of the source page or document
  "notes": string | null,        // brief note if not found or partial
  "fields": {
    "cure_temperature_f": number | null,          // FAHRENHEIT
    "cure_time": string | null,
    "dry_tg_onset_f": number | null,              // FAHRENHEIT
    "wet_tg_f": number | null,                    // FAHRENHEIT
    "peak_tg_f": number | null,                   // FAHRENHEIT
    "max_service_temperature_f": number | null,   // FAHRENHEIT
    "out_life_days": number | null,
    "freezer_life_months": number | null,
    "tml_pct": number | null,
    "cvcm_pct": number | null,
    "tensile_lap_shear_mpa": number | null,
    "t_peel_n_per_25mm": number | null,
    "flatwise_tension_mpa": number | null,
    "climbing_drum_peel_in_lb_per_in": number | null,
    "process_method": string | null,
    "resin_chemistry": string | null,
    "reinforcement": string | null,
    "product_form": string | null,
    "applications": string | null,
    "qualifications_standards": string | null
  }
}

CRITICAL RULES:
- ALL temperatures MUST be in degrees Fahrenheit. If the data sheet only gives Celsius, convert: F = C * 9/5 + 32.
- Use null for any field not explicitly stated on the data sheet. Do NOT guess.
- Only return URLs you have high confidence are real and publicly accessible.
- Output ONLY the JSON object, no markdown fences, no commentary.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "lovable-app",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a precise aerospace materials data extraction assistant. Always return strict JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    // Strip possible markdown fences just in case
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model did not return JSON: ${text.slice(0, 200)}`);
  }
  return ScrapeResponseSchema.parse(parsed);
}

async function isSuperAdmin(supabase: ReturnType<typeof createServerFn> extends never ? never : any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw new Response("Forbidden", { status: 403 });
  if (!data) throw new Response("Forbidden: super admin required", { status: 403 });
}

/**
 * Scrape one master spec. force=true overwrites existing field values;
 * force=false (bulk default) only fills empty/null fields.
 */
export const scrapeSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { specId: string; force?: boolean }) => ({
    specId: String(d.specId),
    force: !!d.force,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);

    const { data: spec, error: specErr } = await supabase
      .from("master_specs")
      .select("*")
      .eq("id", data.specId)
      .maybeSingle();
    if (specErr || !spec) throw new Response("Spec not found", { status: 404 });

    try {
      const result = await callGemini(spec.vendor, spec.product_name);
      const patch: Record<string, unknown> = {
        tds_url: result.url,
        tds_source_title: result.source_title,
        tds_scraped_at: new Date().toISOString(),
        tds_scrape_status: result.found && result.url ? "success" : "not_found",
        tds_scrape_error: null,
      };
      const filled: string[] = [];
      for (const [field, col] of Object.entries(FIELD_TO_COLUMN) as [keyof ScrapeFields, string][]) {
        const v = result.fields[field];
        if (v === null || v === undefined || v === "") continue;
        const existing = (spec as Record<string, unknown>)[col];
        const isEmpty = existing === null || existing === undefined || existing === "";
        if (data.force || isEmpty) {
          patch[col] = v;
          filled.push(col);
        }
      }
      const { error: updErr } = await supabase
        .from("master_specs")
        .update(patch as never)
        .eq("id", data.specId);
      if (updErr) throw new Error(updErr.message);
      return {
        status: patch.tds_scrape_status as string,
        url: result.url,
        sourceTitle: result.source_title,
        filled,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase
        .from("master_specs")
        .update({
          tds_scraped_at: new Date().toISOString(),
          tds_scrape_status: "failed",
          tds_scrape_error: message.slice(0, 500),
        })
        .eq("id", data.specId);
      return { status: "failed" as const, url: null, sourceTitle: null, filled: [], error: message };
    }
  });

/** Start a bulk job for every spec where tds_scraped_at IS NULL. */
export const startBulkScrape = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);

    const { count, error: cErr } = await supabase
      .from("master_specs")
      .select("id", { count: "exact", head: true })
      .is("tds_scraped_at", null);
    if (cErr) throw new Error(cErr.message);

    const { data: job, error: jErr } = await supabase
      .from("master_spec_scrape_jobs")
      .insert({
        started_by: userId,
        total: count ?? 0,
        status: (count ?? 0) === 0 ? "completed" : "running",
        finished_at: (count ?? 0) === 0 ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (jErr || !job) throw new Error(jErr?.message ?? "Failed to create job");
    return { jobId: job.id as string, total: job.total as number, status: job.status as string };
  });

const BATCH_SIZE = 5;

export const runBulkScrapeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => ({ jobId: String(d.jobId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);

    const { data: job, error: jErr } = await supabase
      .from("master_spec_scrape_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jErr || !job) throw new Response("Job not found", { status: 404 });
    if (job.status !== "running") {
      return {
        status: job.status as string,
        processed: job.processed as number,
        total: job.total as number,
        succeeded: job.succeeded as number,
        failed: job.failed as number,
        remaining: 0,
        currentSpecId: null as string | null,
        currentLabel: null as string | null,
      };
    }

    const { data: batch, error: bErr } = await supabase
      .from("master_specs")
      .select("id, vendor, product_name")
      .is("tds_scraped_at", null)
      .order("vendor")
      .order("product_name")
      .limit(BATCH_SIZE);
    if (bErr) throw new Error(bErr.message);

    if (!batch || batch.length === 0) {
      await supabase
        .from("master_spec_scrape_jobs")
        .update({ status: "completed", finished_at: new Date().toISOString(), current_spec_id: null })
        .eq("id", data.jobId);
      return {
        status: "completed",
        processed: job.processed as number,
        total: job.total as number,
        succeeded: job.succeeded as number,
        failed: job.failed as number,
        remaining: 0,
        currentSpecId: null,
        currentLabel: null,
      };
    }

    let succeeded = 0;
    let failed = 0;
    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          await supabase
            .from("master_spec_scrape_jobs")
            .update({ current_spec_id: row.id })
            .eq("id", data.jobId);
          const result = await callGemini(row.vendor, row.product_name);
          const patch: Record<string, unknown> = {
            tds_url: result.url,
            tds_source_title: result.source_title,
            tds_scraped_at: new Date().toISOString(),
            tds_scrape_status: result.found && result.url ? "success" : "not_found",
            tds_scrape_error: null,
          };
          // Need full spec for empty-check; refetch
          const { data: full } = await supabase
            .from("master_specs")
            .select("*")
            .eq("id", row.id)
            .single();
          if (full) {
            for (const [field, col] of Object.entries(FIELD_TO_COLUMN) as [keyof ScrapeFields, string][]) {
              const v = result.fields[field];
              if (v === null || v === undefined || v === "") continue;
              const existing = (full as Record<string, unknown>)[col];
              if (existing === null || existing === undefined || existing === "") {
                patch[col] = v;
              }
            }
          }
          await supabase.from("master_specs").update(patch as never).eq("id", row.id);
          return patch.tds_scrape_status === "success";
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          await supabase
            .from("master_specs")
            .update({
              tds_scraped_at: new Date().toISOString(),
              tds_scrape_status: "failed",
              tds_scrape_error: message.slice(0, 500),
            })
            .eq("id", row.id);
          return false;
        }
      }),
    );
    for (const ok of results) ok ? succeeded++ : failed++;

    const newProcessed = (job.processed as number) + batch.length;
    const newSucceeded = (job.succeeded as number) + succeeded;
    const newFailed = (job.failed as number) + failed;
    const remaining = Math.max(0, (job.total as number) - newProcessed);
    const done = remaining === 0;

    const { data: updatedJob } = await supabase
      .from("master_spec_scrape_jobs")
      .update({
        processed: newProcessed,
        succeeded: newSucceeded,
        failed: newFailed,
        status: done ? "completed" : "running",
        finished_at: done ? new Date().toISOString() : null,
        current_spec_id: done ? null : batch[batch.length - 1].id,
      })
      .eq("id", data.jobId)
      .select("*")
      .single();

    const last = batch[batch.length - 1];
    return {
      status: (updatedJob?.status as string) ?? (done ? "completed" : "running"),
      processed: newProcessed,
      total: job.total as number,
      succeeded: newSucceeded,
      failed: newFailed,
      remaining,
      currentSpecId: done ? null : last.id,
      currentLabel: done ? null : `${last.vendor} ${last.product_name}`,
    };
  });

export const getBulkScrapeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => ({ jobId: String(d.jobId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);
    const { data: job, error } = await supabase
      .from("master_spec_scrape_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error || !job) throw new Response("Job not found", { status: 404 });
    return job;
  });

export const cancelBulkScrape = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => ({ jobId: String(d.jobId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);
    const { error } = await supabase
      .from("master_spec_scrape_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString(), current_spec_id: null })
      .eq("id", data.jobId)
      .eq("status", "running");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
