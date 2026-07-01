// Orchestrates the "Scrape TDS/PDS" header button and the per-row "Scrape TDS"
// button through the Firecrawl-backed Data Sheets pipeline using **curated
// per-manufacturer seed pages** (Hexcel, 3M, Toray, Syensqo, Henkel).
//
// Everything hits the same code path that /admin/data-sheets uses:
//   1. Group specs missing a stored PDF by canonical vendor (via aliases).
//   2. For each supported vendor, spawn a `data_sheet_crawl_jobs` row seeded
//      with that vendor's known TDS/PDS pages (matweb + manufacturer site).
//   3. The runner maps each seed, filters links by product-name tokens +
//      TDS/PDS URL hints, then scrapes + downloads + auto-matches to specs.
//
// The legacy Gemini-URL-guessing path has been removed.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runOneCrawlBatch, logScrape } from "@/lib/dataSheets.runner.server";
import { VENDOR_SOURCES, resolveVendorKey } from "@/lib/vendorSources";
import type { CandidateUrl } from "@/lib/dataSheets.server";

async function isSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw new Response("Forbidden", { status: 403 });
  if (!data) throw new Response("Forbidden: super admin required", { status: 403 });
}

/** Alphanumeric-lowercase tokenizer used to filter mapped links by product name. */
function tokenize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Build initial pending_urls: one `seed` entry per curated vendor source page. */
function buildVendorSeedPending(vendorKey: string, products: string[]): CandidateUrl[] {
  const src = VENDOR_SOURCES[vendorKey];
  if (!src) return [];
  const tokens = Array.from(
    new Set(products.map(tokenize).filter((t) => t.length >= 3)),
  );
  return src.seeds.map((url) => ({
    url,
    vendorHint: vendorKey,
    pageUrl: null,
    productNumber: null,
    seed: true,
    productFilterTokens: tokens,
  }));
}

/** Create one child crawl job for a canonical vendor. Returns id + pending total. */
async function createVendorChildJob(vendorKey: string, products: string[], userId: string) {
  const pending = buildVendorSeedPending(vendorKey, products);
  if (pending.length === 0) return null;
  const { data: job, error } = await supabaseAdmin
    .from("data_sheet_crawl_jobs")
    .insert({
      source_url: `vendor-sources:${vendorKey}`,
      crawl_mode: "crawl",
      max_pages: 500,
      status: "running",
      total: pending.length,
      pending_urls: pending as never,
      vendor: vendorKey,
      search_template: null,
      created_by: userId,
    } as never)
    .select("id, total")
    .single();

  if (error || !job) throw new Error(error?.message ?? "Failed to create child crawl job");
  return { id: job.id as string, total: job.total as number };
}

// -------- Single-spec scrape (per-row "Scrape TDS" button) --------

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
      .select("id, vendor, product_name, tds_pdf_path")
      .eq("id", data.specId)
      .maybeSingle();
    if (specErr || !spec) throw new Response("Spec not found", { status: 404 });
    if (!spec.vendor || !spec.product_name) {
      await logScrape({
        masterSpecId: data.specId,
        step: "orchestrate",
        status: "skipped",
        errorMessage: "Missing vendor or product name on master spec",
      });
      return { status: "failed" as const, url: null, sourceTitle: null, error: "Missing vendor or product name" };
    }

    const vendorKey = resolveVendorKey(spec.vendor);
    if (!vendorKey) {
      await logScrape({
        masterSpecId: data.specId,
        vendor: spec.vendor,
        productName: spec.product_name,
        step: "orchestrate",
        status: "skipped",
        errorMessage: `No curated vendor-source list for "${spec.vendor}". Supported: ${Object.keys(VENDOR_SOURCES).join(", ")}.`,
      });
      return { status: "not_found" as const, url: null, sourceTitle: null };
    }

    const child = await createVendorChildJob(vendorKey, [spec.product_name], userId);
    if (!child) {
      await logScrape({
        masterSpecId: data.specId,
        vendor: vendorKey,
        productName: spec.product_name,
        step: "orchestrate",
        status: "not_found",
        errorMessage: "Vendor has no seed URLs configured",
      });
      return { status: "not_found" as const, url: null, sourceTitle: null };
    }

    await logScrape({
      masterSpecId: data.specId,
      childJobId: child.id,
      vendor: vendorKey,
      productName: spec.product_name,
      step: "orchestrate",
      status: "info",
      errorMessage: `Spawned vendor-sources crawl (${child.total} seed page${child.total === 1 ? "" : "s"})`,
    });

    // Seed pages fan out into many candidates; loop with a safety cap.
    for (let i = 0; i < 40; i++) {
      const r = await runOneCrawlBatch(child.id);
      if (r.status !== "running" || r.remaining === 0) break;
    }

    const { data: sheet } = await supabaseAdmin
      .from("data_sheets")
      .select("id, pdf_url, title, match_status")
      .eq("job_id", child.id)
      .in("match_status", ["auto", "suggested", "manual"])
      .eq("master_spec_id", data.specId)
      .order("confidence", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sheet?.pdf_url) {
      await logScrape({
        masterSpecId: data.specId,
        childJobId: child.id,
        dataSheetId: sheet.id,
        vendor: vendorKey,
        productName: spec.product_name,
        step: "orchestrate",
        status: "success",
        attemptedUrl: sheet.pdf_url,
        errorMessage: `Scrape complete: ${sheet.match_status}`,
      });
      return {
        status: "success" as const,
        url: sheet.pdf_url,
        sourceTitle: sheet.title,
      };
    }

    await logScrape({
      masterSpecId: data.specId,
      childJobId: child.id,
      vendor: vendorKey,
      productName: spec.product_name,
      step: "orchestrate",
      status: "not_found",
      errorMessage: "Crawl finished with no matched PDF — check per-step logs above",
    });
    return { status: "not_found" as const, url: null, sourceTitle: null };
  });

// -------- Bulk scrape (header "Scrape TDS/PDS" button) --------

export const startBulkScrape = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);

    // Every spec still missing a stored PDF, grouped by canonical vendor.
    const { data: rows, error: rErr } = await supabaseAdmin
      .from("master_specs")
      .select("vendor, product_name")
      .is("tds_pdf_path", null);
    if (rErr) throw new Error(rErr.message);

    const byVendor = new Map<string, string[]>();
    const skippedVendors = new Set<string>();
    for (const r of rows ?? []) {
      const rawVendor = (r.vendor ?? "").trim();
      const p = (r.product_name ?? "").trim();
      if (!rawVendor || !p) continue;
      const key = resolveVendorKey(rawVendor);
      if (!key) {
        skippedVendors.add(rawVendor);
        continue;
      }
      if (!byVendor.has(key)) byVendor.set(key, []);
      byVendor.get(key)!.push(p);
    }

    if (skippedVendors.size > 0) {
      await logScrape({
        step: "orchestrate",
        status: "skipped",
        errorMessage: `Skipped ${skippedVendors.size} unsupported vendor(s): ${Array.from(skippedVendors).slice(0, 10).join(", ")}`,
        details: { skippedVendors: Array.from(skippedVendors) },
      });
    }

    const childIds: string[] = [];
    let total = 0;
    for (const [vendor, products] of byVendor.entries()) {
      const child = await createVendorChildJob(vendor, products, userId);
      if (child) {
        childIds.push(child.id);
        total += child.total;
      }
    }

    const status = total === 0 ? "completed" : "running";
    const { data: job, error: jErr } = await supabaseAdmin
      .from("master_spec_scrape_jobs")
      .insert({
        started_by: userId,
        total,
        status,
        mode: "firecrawl",
        child_job_ids: childIds as never,
        finished_at: status === "completed" ? new Date().toISOString() : null,
      })
      .select("id, total, status")
      .single();
    if (jErr || !job) throw new Error(jErr?.message ?? "Failed to create bulk job");

    return { jobId: job.id as string, total: job.total as number, status: job.status as string };
  });

export const runBulkScrapeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => ({ jobId: String(d.jobId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);

    const { data: job, error: jErr } = await supabaseAdmin
      .from("master_spec_scrape_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jErr || !job) throw new Response("Job not found", { status: 404 });

    const childIds: string[] = Array.isArray(job.child_job_ids) ? (job.child_job_ids as string[]) : [];

    if (job.status !== "running" || childIds.length === 0) {
      return summarize(job, 0, null);
    }

    type ChildRow = {
      id: string;
      status: string;
      total: number;
      processed: number;
      succeeded: number;
      failed: number;
      pending_urls: unknown[] | null;
      vendor: string | null;
    };
    const { data: childrenRaw } = await supabaseAdmin
      .from("data_sheet_crawl_jobs")
      .select("id, status, total, processed, succeeded, failed, pending_urls, vendor")
      .in("id", childIds);
    const children = (childrenRaw ?? []) as unknown as ChildRow[];
    const childMap = new Map(children.map((c) => [c.id, c]));

    const activeId = childIds.find((id) => {
      const c = childMap.get(id);
      return c && c.status === "running" && Array.isArray(c.pending_urls) && c.pending_urls.length > 0;
    });

    let currentLabel: string | null = null;
    if (activeId) {
      const before = childMap.get(activeId)!;
      currentLabel = before.vendor ?? null;
      try {
        const r = await runOneCrawlBatch(activeId);
        currentLabel = r.currentLabel ?? currentLabel;
      } catch {
        await supabaseAdmin
          .from("data_sheet_crawl_jobs")
          .update({ status: "failed", pending_urls: [] as never } as never)
          .eq("id", activeId);
      }
    }

    const { data: refreshed } = await supabaseAdmin
      .from("data_sheet_crawl_jobs")
      .select("status, total, processed, succeeded, failed, pending_urls")
      .in("id", childIds);

    let total = 0;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let remaining = 0;
    let anyRunning = false;
    for (const c of refreshed ?? []) {
      total += (c.total as number) ?? 0;
      processed += (c.processed as number) ?? 0;
      succeeded += (c.succeeded as number) ?? 0;
      failed += (c.failed as number) ?? 0;
      const pend = Array.isArray(c.pending_urls) ? (c.pending_urls as unknown[]).length : 0;
      remaining += pend;
      if (c.status === "running" && pend > 0) anyRunning = true;
    }

    const done = !anyRunning;
    await supabaseAdmin
      .from("master_spec_scrape_jobs")
      .update({
        total,
        processed,
        succeeded,
        failed,
        status: done ? "completed" : "running",
        finished_at: done ? new Date().toISOString() : null,
      })
      .eq("id", data.jobId);

    return {
      status: done ? "completed" : "running",
      processed,
      total,
      succeeded,
      failed,
      remaining,
      currentSpecId: null as string | null,
      currentLabel,
    };
  });

function summarize(job: any, remaining: number, currentLabel: string | null) {
  return {
    status: job.status as string,
    processed: (job.processed as number) ?? 0,
    total: (job.total as number) ?? 0,
    succeeded: (job.succeeded as number) ?? 0,
    failed: (job.failed as number) ?? 0,
    remaining,
    currentSpecId: null as string | null,
    currentLabel,
  };
}

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

    const { data: job } = await supabaseAdmin
      .from("master_spec_scrape_jobs")
      .select("child_job_ids")
      .eq("id", data.jobId)
      .maybeSingle();
    const childIds: string[] = Array.isArray(job?.child_job_ids)
      ? (job!.child_job_ids as string[])
      : [];
    if (childIds.length > 0) {
      await supabaseAdmin
        .from("data_sheet_crawl_jobs")
        .update({ status: "cancelled", pending_urls: [] as never })
        .in("id", childIds)
        .eq("status", "running");
    }
    await supabaseAdmin
      .from("master_spec_scrape_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString(), current_spec_id: null })
      .eq("id", data.jobId)
      .eq("status", "running");
    return { ok: true };
  });

// -------- Debug: read scrape logs --------

export type ScrapeLogRow = {
  id: string;
  created_at: string;
  master_spec_id: string | null;
  bulk_job_id: string | null;
  child_job_id: string | null;
  data_sheet_id: string | null;
  vendor: string | null;
  product_name: string | null;
  step: string;
  status: string;
  source_url: string | null;
  attempted_url: string | null;
  http_status: number | null;
  error_message: string | null;
  details: string | null;
};

export const listScrapeLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { specId?: string; status?: string; step?: string; limit?: number }) => ({
    specId: d.specId ? String(d.specId) : undefined,
    status: d.status ? String(d.status) : undefined,
    step: d.step ? String(d.step) : undefined,
    limit: Math.min(Math.max(Number(d.limit) || 200, 1), 1000),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await isSuperAdmin(supabase, userId);
    let q = supabaseAdmin
      .from("scrape_logs" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.specId) q = q.eq("master_spec_id", data.specId);
    if (data.status) q = q.eq("status", data.status);
    if (data.step) q = q.eq("step", data.step);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const raw = (rows ?? []) as unknown as Array<Record<string, unknown>>;
    return raw.map((r) => ({
      ...r,
      details: r.details == null ? null : JSON.stringify(r.details),
    })) as unknown as ScrapeLogRow[];
  });
