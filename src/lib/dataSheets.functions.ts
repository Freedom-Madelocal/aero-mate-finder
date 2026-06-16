import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  firecrawlMap,
  firecrawlScrape,
  downloadPdf,
  extractFromMarkdown,
  looksLikeDataSheetUrl,
  bestMatch,
  FIELD_TO_COLUMN,
  type CandidateUrl,
  type SpecCandidate,
} from "@/lib/dataSheets.server";

const BATCH_SIZE = 3;
const AUTO_MATCH_THRESHOLD = 0.85;
const SUGGEST_THRESHOLD = 0.6;

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

    const { data: job, error: jErr } = await supabaseAdmin
      .from("data_sheet_crawl_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jErr || !job) throw new Response("Job not found", { status: 404 });
    if (job.status !== "running") {
      return summarize(job, 0);
    }

    const pending: CandidateUrl[] = Array.isArray(job.pending_urls) ? (job.pending_urls as CandidateUrl[]) : [];
    const batch = pending.slice(0, BATCH_SIZE);
    const rest = pending.slice(batch.length);

    // Load all specs once for matching (vendor + name only).
    const { data: specs } = await supabaseAdmin
      .from("master_specs")
      .select("id, vendor, product_name");
    const candidates: SpecCandidate[] = (specs ?? []) as SpecCandidate[];

    let succeeded = 0;
    let failed = 0;
    let lastLabel: string | null = null;
    const enqueued: CandidateUrl[] = [];

    for (const item of batch) {
      lastLabel = item.url;
      try {
        const scraped = await firecrawlScrape(item.url);
        if (!scraped.isPdf) {
          if (item.searchMode) {
            // Search results page — pick the best candidate link(s).
            const q = (item.productNumber ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const candidatesLinks = scraped.links
              .map((l) => ({ url: l, lower: l.toLowerCase() }))
              .filter((l) => {
                try {
                  const u = new URL(l.url);
                  // Stay roughly on-domain or follow PDF links anywhere
                  return /\.pdf(\?|#|$)/i.test(l.url) || u.hostname === new URL(item.url).hostname;
                } catch {
                  return false;
                }
              });
            const pdfMatches = candidatesLinks.filter((l) => /\.pdf(\?|#|$)/i.test(l.lower));
            const scored = pdfMatches
              .map((l) => {
                const norm = l.lower.replace(/[^a-z0-9]/g, "");
                const score = q && norm.includes(q) ? 2 : 1;
                return { ...l, score };
              })
              .sort((a, b) => b.score - a.score);
            let chosen: string[] = scored.slice(0, 2).map((s) => s.url);
            if (chosen.length === 0) {
              // Fall back to product-page links containing the number
              const productPages = candidatesLinks
                .filter((l) => !q || l.lower.replace(/[^a-z0-9]/g, "").includes(q))
                .slice(0, 3)
                .map((l) => l.url);
              enqueued.push(
                ...productPages.map((u) => ({
                  url: u,
                  vendorHint: item.vendorHint,
                  pageUrl: scraped.sourceUrl,
                  productNumber: item.productNumber,
                  searchMode: false,
                })),
              );
              if (productPages.length === 0) {
                await supabaseAdmin.from("data_sheets").insert({
                  job_id: data.jobId,
                  source_url: job.source_url,
                  pdf_url: item.url,
                  doc_type: "other",
                  match_status: "unmatched",
                  parsed_specs: {} as never,
                  vendor: item.vendorHint,
                  product_name: item.productNumber ?? null,
                  error: `No PDF or product link found for "${item.productNumber}"`,
                });
                failed++;
              }
              continue;
            }
            enqueued.push(
              ...chosen.map((u) => ({
                url: u,
                vendorHint: item.vendorHint,
                pageUrl: scraped.sourceUrl,
                productNumber: item.productNumber,
                searchMode: false,
              })),
            );
            continue;
          }
          // Enqueue PDF-looking links found on the page.
          const more = scraped.links
            .filter((l) => looksLikeDataSheetUrl(l))
            .slice(0, 20)
            .map((u) => ({ url: u, vendorHint: item.vendorHint, pageUrl: scraped.sourceUrl }));
          enqueued.push(...more);
          failed++; // counted as "processed but no sheet"
          continue;
        }

        // It's a PDF — extract fields, download bytes, store.
        const fields = await extractFromMarkdown(scraped.markdown, scraped.title, item.url);
        const sheetId = crypto.randomUUID();
        let pdfPath: string | null = null;
        let pdfSize: number | null = null;
        const bytes = await downloadPdf(item.url);
        if (bytes) {
          const path = `data-sheets/${sheetId}.pdf`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("tds-pdfs")
            .upload(path, bytes, { contentType: "application/pdf", upsert: true });
          if (!upErr) {
            pdfPath = path;
            pdfSize = bytes.byteLength;
          }
        }

        const vendor = fields.vendor ?? item.vendorHint;
        const product = fields.product_name ?? item.productNumber ?? null;
        let match = bestMatch(vendor, product, candidates);
        // If this came from a vendor search with a known product#, prefer that direct match.
        if (item.productNumber && item.vendorHint) {
          const direct = candidates.find(
            (c) =>
              c.vendor?.toLowerCase().includes(item.vendorHint!.toLowerCase()) &&
              c.product_name?.toLowerCase() === item.productNumber!.toLowerCase(),
          );
          if (direct) match = { id: direct.id, confidence: 0.99 };
        }
        let matchStatus: "auto" | "suggested" | "unmatched" = "unmatched";
        let masterSpecId: string | null = null;
        if (match) {
          if (match.confidence >= AUTO_MATCH_THRESHOLD) {
            matchStatus = "auto";
            masterSpecId = match.id;
          } else if (match.confidence >= SUGGEST_THRESHOLD) {
            matchStatus = "suggested";
            masterSpecId = match.id;
          }
        }

        const { error: insErr } = await supabaseAdmin.from("data_sheets").insert({
          id: sheetId,
          job_id: data.jobId,
          source_url: item.pageUrl ?? job.source_url,
          page_url: item.pageUrl,
          pdf_url: item.url,
          pdf_path: pdfPath,
          pdf_size: pdfSize,
          doc_type: fields.doc_type ?? "tds",
          vendor,
          product_name: product,
          title: scraped.title,
          parsed_specs: fields as never,
          raw_text: scraped.markdown.slice(0, 200_000),
          match_status: matchStatus,
          master_spec_id: masterSpecId,
          confidence: match?.confidence ?? null,
        });
        if (insErr) throw new Error(insErr.message);

        // Auto-apply if high confidence.
        if (matchStatus === "auto" && masterSpecId) {
          await applySheetToSpec(masterSpecId, sheetId, false);
        }
        succeeded++;
      } catch (e) {
        // Record a failed sheet row so admins see the error.
        await supabaseAdmin.from("data_sheets").insert({
          job_id: data.jobId,
          source_url: job.source_url,
          pdf_url: item.url,
          doc_type: "other",
          match_status: "unmatched",
          parsed_specs: {} as never,
          error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        });
        failed++;
      }
    }

    const newPending = [...rest, ...enqueued];
    const newProcessed = (job.processed as number) + batch.length;
    const newSucceeded = (job.succeeded as number) + succeeded;
    const newFailed = (job.failed as number) + failed;
    const remaining = newPending.length;
    const done = remaining === 0;

    const { data: updated } = await supabaseAdmin
      .from("data_sheet_crawl_jobs")
      .update({
        processed: newProcessed,
        succeeded: newSucceeded,
        failed: newFailed,
        pending_urls: newPending as never,
        total: Math.max(job.total as number, newProcessed + remaining),
        status: done ? "completed" : "running",
      })
      .eq("id", data.jobId)
      .select("*")
      .single();

    return summarize(updated ?? job, remaining, lastLabel);
  });

function summarize(job: any, remaining: number, currentLabel: string | null = null) {
  return {
    status: job.status as string,
    total: job.total as number,
    processed: job.processed as number,
    succeeded: job.succeeded as number,
    failed: job.failed as number,
    remaining,
    currentLabel,
  };
}

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

async function applySheetToSpec(specId: string, sheetId: string, overwrite: boolean) {
  const { data: sheet } = await supabaseAdmin
    .from("data_sheets")
    .select("parsed_specs, pdf_path, pdf_size, pdf_url, doc_type, title")
    .eq("id", sheetId)
    .maybeSingle();
  if (!sheet) return;
  const { data: spec } = await supabaseAdmin
    .from("master_specs")
    .select("*")
    .eq("id", specId)
    .maybeSingle();
  if (!spec) return;

  const patch: Record<string, unknown> = {};
  const parsed = (sheet.parsed_specs ?? {}) as Record<string, unknown>;
  for (const [field, col] of Object.entries(FIELD_TO_COLUMN)) {
    const v = parsed[field];
    if (v === null || v === undefined || v === "") continue;
    const existing = (spec as Record<string, unknown>)[col];
    const isEmpty = existing === null || existing === undefined || existing === "";
    if (overwrite || isEmpty) patch[col] = v;
  }
  if (sheet.pdf_path) {
    patch.tds_pdf_path = sheet.pdf_path;
    patch.tds_pdf_size = sheet.pdf_size;
    patch.tds_pdf_downloaded_at = new Date().toISOString();
  }
  if (sheet.pdf_url) {
    patch.tds_url = sheet.pdf_url;
    patch.tds_source_title = sheet.title;
    patch.tds_scraped_at = new Date().toISOString();
    patch.tds_scrape_status = "success";
    patch.tds_scrape_error = null;
  }
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from("master_specs").update(patch as never).eq("id", specId);
  }
}

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
