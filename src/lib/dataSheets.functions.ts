import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  firecrawlMap,
  looksLikeDataSheetUrl,
  type CandidateUrl,
} from "@/lib/dataSheets.server";

import {
  runOneCrawlBatch,
  applySheetToSpec,
  AUTO_MATCH_THRESHOLD,
} from "@/lib/dataSheets.runner.server";


async function requireSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error || !data) throw new Response("Forbidden: super admin required", { status: 403 });
}

// -------- Start crawl --------

export const startDataSheetCrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    sourceUrl?: string;
    pdfUrls?: string[];
    maxPages?: number;
    mode?: "crawl" | "urls" | "search";
    vendor?: string;
    searchTemplate?: string;
    productNumbers?: string[];
    useAllForVendor?: boolean;
  }) => ({
    sourceUrl: d.sourceUrl?.trim() ?? "",
    pdfUrls: Array.isArray(d.pdfUrls) ? d.pdfUrls.map((u) => u.trim()).filter(Boolean) : [],
    maxPages: Math.min(Math.max(d.maxPages ?? 50, 1), 500),
    mode: d.mode,
    vendor: d.vendor?.trim() ?? "",
    searchTemplate: d.searchTemplate?.trim() ?? "",
    productNumbers: Array.isArray(d.productNumbers)
      ? d.productNumbers.map((s) => s.trim()).filter(Boolean)
      : [],
    useAllForVendor: !!d.useAllForVendor,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireSuperAdmin(supabase, userId);

    let pending: CandidateUrl[] = [];
    let mode: "crawl" | "urls" | "search" = "urls";
    let sourceUrl = data.sourceUrl;

    const isSearchMode =
      data.mode === "search" ||
      (!!data.searchTemplate && (data.productNumbers.length > 0 || data.useAllForVendor));

    if (isSearchMode) {
      mode = "search";
      if (!data.searchTemplate || !data.searchTemplate.includes("{query}")) {
        throw new Error("Search template must contain {query}");
      }
      if (!data.vendor) throw new Error("Vendor is required for search mode");

      let numbers = [...data.productNumbers];
      if (data.useAllForVendor) {
        const { data: specs } = await supabaseAdmin
          .from("master_specs")
          .select("product_name, tds_pdf_path")
          .ilike("vendor", data.vendor);
        for (const s of specs ?? []) {
          if (s.product_name && !s.tds_pdf_path) numbers.push(s.product_name);
        }
      }
      numbers = Array.from(new Set(numbers.map((n) => n.trim()).filter(Boolean)));
      pending = numbers.slice(0, data.maxPages).map((n) => ({
        url: data.searchTemplate.replace("{query}", encodeURIComponent(n)),
        vendorHint: data.vendor,
        pageUrl: null,
        productNumber: n,
        searchMode: true,
      }));
      sourceUrl = `search:${data.vendor}`;
    } else if (data.pdfUrls.length > 0) {
      pending = data.pdfUrls.map((u) => ({ url: u, vendorHint: null, pageUrl: null }));
      sourceUrl = sourceUrl || data.pdfUrls[0];
      mode = "urls";
    } else if (sourceUrl) {
      mode = "crawl";
      const mapped = await firecrawlMap(sourceUrl, 500);
      const filtered = mapped.filter(looksLikeDataSheetUrl).slice(0, data.maxPages);
      const vendorHint = (() => {
        try {
          const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
          return host.split(".")[0];
        } catch {
          return null;
        }
      })();
      pending = filtered.map((u) => ({ url: u, vendorHint, pageUrl: null }));
    } else {
      throw new Error("Provide either a source URL, PDF URLs, or a search template with product numbers.");
    }

    const total = pending.length;
    const insertPayload: Record<string, unknown> = {
      source_url: sourceUrl,
      crawl_mode: mode,
      max_pages: data.maxPages,
      status: total === 0 ? "completed" : "running",
      total,
      pending_urls: pending,
      vendor: data.vendor || null,
      search_template: data.searchTemplate || null,
      created_by: userId,
    };
    const { data: job, error } = await supabaseAdmin
      .from("data_sheet_crawl_jobs")
      .insert(insertPayload as never)
      .select("*")
      .single();
    if (error || !job) throw new Error(error?.message ?? "Failed to start job");

    return {
      jobId: job.id as string,
      total,
      status: job.status as string,
      discovered: pending.map((p) => p.url),
    };
  });

// -------- Run batch --------

export const runDataSheetCrawlBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => ({ jobId: String(d.jobId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireSuperAdmin(supabase, userId);
    return await runOneCrawlBatch(data.jobId);
  });



// -------- Cancel --------

export const cancelDataSheetCrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => ({ jobId: String(d.jobId) }))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("data_sheet_crawl_jobs")
      .update({ status: "cancelled", pending_urls: [] as never })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- List jobs --------

export const listDataSheetJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin
      .from("data_sheet_crawl_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// -------- List sheets --------

export const listDataSheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId?: string; matchStatus?: string }) => ({
    jobId: d.jobId,
    matchStatus: d.matchStatus,
  }))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("data_sheets")
      .select(
        "id, job_id, pdf_url, pdf_path, pdf_size, doc_type, vendor, product_name, title, match_status, master_spec_id, confidence, error, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.jobId) q = q.eq("job_id", data.jobId);
    if (data.matchStatus) q = q.eq("match_status", data.matchStatus);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// -------- Sheets for a master spec (engineer view) --------

export const getDataSheetsForSpec = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { specId: string }) => ({ specId: String(d.specId) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("data_sheets")
      .select("id, pdf_url, pdf_path, doc_type, vendor, product_name, title, created_at")
      .eq("master_spec_id", data.specId)
      .in("match_status", ["auto", "manual"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// -------- Signed URL --------

export const getDataSheetSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sheetId: string }) => ({ sheetId: String(d.sheetId) }))
  .handler(async ({ data }) => {
    const { data: sheet, error } = await supabaseAdmin
      .from("data_sheets")
      .select("pdf_path, pdf_url")
      .eq("id", data.sheetId)
      .maybeSingle();
    if (error || !sheet) throw new Response("Not found", { status: 404 });
    if (!sheet.pdf_path) return { url: sheet.pdf_url, signed: false };
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("tds-pdfs")
      .createSignedUrl(sheet.pdf_path, 60 * 10);
    if (sErr || !signed?.signedUrl) return { url: sheet.pdf_url, signed: false };
    return { url: signed.signedUrl, signed: true };
  });

// -------- Apply / accept / reject --------
// applySheetToSpec now lives in dataSheets.runner.server.ts (shared with bulk scrape).


export const acceptDataSheetMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sheetId: string; specId?: string; overwrite?: boolean }) => ({
    sheetId: String(d.sheetId),
    specId: d.specId ? String(d.specId) : undefined,
    overwrite: !!d.overwrite,
  }))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    let specId = data.specId;
    if (!specId) {
      const { data: s } = await supabaseAdmin
        .from("data_sheets")
        .select("master_spec_id")
        .eq("id", data.sheetId)
        .maybeSingle();
      specId = s?.master_spec_id ?? undefined;
    }
    if (!specId) throw new Error("No master spec selected for this sheet.");
    await supabaseAdmin
      .from("data_sheets")
      .update({ master_spec_id: specId, match_status: "manual", confidence: 1 })
      .eq("id", data.sheetId);
    await applySheetToSpec(specId, data.sheetId, data.overwrite);
    return { ok: true };
  });

export const rejectDataSheetMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sheetId: string }) => ({ sheetId: String(d.sheetId) }))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    await supabaseAdmin
      .from("data_sheets")
      .update({ match_status: "rejected", master_spec_id: null })
      .eq("id", data.sheetId);
    return { ok: true };
  });

export const deleteDataSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sheetId: string }) => ({ sheetId: String(d.sheetId) }))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { data: sheet } = await supabaseAdmin
      .from("data_sheets")
      .select("pdf_path")
      .eq("id", data.sheetId)
      .maybeSingle();
    if (sheet?.pdf_path) {
      await supabaseAdmin.storage.from("tds-pdfs").remove([sheet.pdf_path]);
    }
    await supabaseAdmin.from("data_sheets").delete().eq("id", data.sheetId);
    return { ok: true };
  });

// -------- Auto-accept all high-confidence in a job --------

export const autoAcceptHighConfidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId?: string; overwrite?: boolean }) => ({
    jobId: d.jobId,
    overwrite: !!d.overwrite,
  }))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    let q = supabaseAdmin
      .from("data_sheets")
      .select("id, master_spec_id")
      .eq("match_status", "suggested")
      .gte("confidence", AUTO_MATCH_THRESHOLD);
    if (data.jobId) q = q.eq("job_id", data.jobId);
    const { data: rows } = await q;
    let applied = 0;
    for (const r of rows ?? []) {
      if (!r.master_spec_id) continue;
      await supabaseAdmin
        .from("data_sheets")
        .update({ match_status: "auto" })
        .eq("id", r.id);
      await applySheetToSpec(r.master_spec_id, r.id, data.overwrite);
      applied++;
    }
    return { applied };
  });

// -------- Master spec search (for manual match) --------

export const searchMasterSpecs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q: string }) => ({ q: String(d.q ?? "").trim() }))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    if (!data.q) return [];
    const term = `%${data.q}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("master_specs")
      .select("id, vendor, product_name")
      .or(`vendor.ilike.${term},product_name.ilike.${term}`)
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// -------- Vendor list & missing TDS count (for search-mode UI) --------

export const listVendorsWithCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin
      .from("master_specs")
      .select("vendor, tds_pdf_path");
    if (error) throw new Error(error.message);
    const map = new Map<string, { total: number; missing: number }>();
    for (const r of data ?? []) {
      const v = (r.vendor ?? "").trim();
      if (!v) continue;
      const entry = map.get(v) ?? { total: 0, missing: 0 };
      entry.total++;
      if (!r.tds_pdf_path) entry.missing++;
      map.set(v, entry);
    }
    return Array.from(map.entries())
      .map(([vendor, c]) => ({ vendor, ...c }))
      .sort((a, b) => b.missing - a.missing);
  });
