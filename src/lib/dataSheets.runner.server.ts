// Shared server-only runner for a single data_sheet_crawl_jobs batch, and the
// applySheetToSpec helper. Extracted from src/lib/dataSheets.functions.ts so that
// both the interactive Data Sheets admin page AND the bulk "Scrape TDS/PDS"
// orchestrator can drive crawl jobs through the exact same Firecrawl pipeline.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  firecrawlScrape,
  downloadPdf,
  extractFromMarkdown,
  looksLikeDataSheetUrl,
  bestMatch,
  FIELD_TO_COLUMN,
  type CandidateUrl,
  type SpecCandidate,
} from "@/lib/dataSheets.server";

export const BATCH_SIZE = 3;
export const AUTO_MATCH_THRESHOLD = 0.85;
export const SUGGEST_THRESHOLD = 0.6;

/**
 * Insert one row into scrape_logs. Silently swallows any error — logging must
 * never break the scrape pipeline itself.
 */
export async function logScrape(entry: {
  masterSpecId?: string | null;
  bulkJobId?: string | null;
  childJobId?: string | null;
  dataSheetId?: string | null;
  vendor?: string | null;
  productName?: string | null;
  step: "search" | "scrape" | "download_pdf" | "extract" | "match" | "apply" | "orchestrate";
  status: "success" | "not_found" | "failed" | "skipped" | "info";
  sourceUrl?: string | null;
  attemptedUrl?: string | null;
  httpStatus?: number | null;
  errorMessage?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    await supabaseAdmin.from("scrape_logs" as never).insert({
      master_spec_id: entry.masterSpecId ?? null,
      bulk_job_id: entry.bulkJobId ?? null,
      child_job_id: entry.childJobId ?? null,
      data_sheet_id: entry.dataSheetId ?? null,
      vendor: entry.vendor ?? null,
      product_name: entry.productName ?? null,
      step: entry.step,
      status: entry.status,
      source_url: entry.sourceUrl ?? null,
      attempted_url: entry.attemptedUrl ?? null,
      http_status: entry.httpStatus ?? null,
      error_message: entry.errorMessage ? String(entry.errorMessage).slice(0, 2000) : null,
      details: (entry.details ?? null) as never,
    } as never);
  } catch {
    /* logging must not throw */
  }
}

export type BatchOutcome = {
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  currentLabel: string | null;
};

function summarize(job: any, remaining: number, currentLabel: string | null = null): BatchOutcome {
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

/** Copy parsed_specs + PDF pointers from a data_sheets row onto a master_specs row. */
export async function applySheetToSpec(specId: string, sheetId: string, overwrite: boolean) {
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

/**
 * Process ONE batch of pending URLs for a data_sheet_crawl_jobs row. Mutates the
 * job row (processed/succeeded/failed/pending_urls/status). Safe to call in a
 * loop until `remaining === 0`.
 */
export async function runOneCrawlBatch(jobId: string): Promise<BatchOutcome> {
  const { data: job, error: jErr } = await supabaseAdmin
    .from("data_sheet_crawl_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jErr || !job) throw new Error("Crawl job not found");
  if (job.status !== "running") return summarize(job, 0);

  const pending: CandidateUrl[] = Array.isArray(job.pending_urls)
    ? (job.pending_urls as CandidateUrl[])
    : [];
  const batch = pending.slice(0, BATCH_SIZE);
  const rest = pending.slice(batch.length);

  const { data: specs } = await supabaseAdmin
    .from("master_specs")
    .select("id, vendor, product_name");
  const candidates: SpecCandidate[] = (specs ?? []) as SpecCandidate[];

  let succeeded = 0;
  let failed = 0;
  let lastLabel: string | null = null;
  const enqueued: CandidateUrl[] = [];

  for (const item of batch) {
    lastLabel = item.productNumber ?? item.url;
    const logBase = {
      childJobId: jobId,
      vendor: item.vendorHint,
      productName: item.productNumber ?? null,
      sourceUrl: item.pageUrl ?? job.source_url,
      attemptedUrl: item.url,
    };
    try {
      const scraped = await firecrawlScrape(item.url);
      if (!scraped.isPdf) {
        if (item.searchMode) {
          const q = (item.productNumber ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const candidatesLinks = scraped.links
            .map((l) => ({ url: l, lower: l.toLowerCase() }))
            .filter((l) => {
              try {
                const u = new URL(l.url);
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
          const chosen = scored.slice(0, 2).map((s) => s.url);
          if (chosen.length === 0) {
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
                job_id: jobId,
                source_url: job.source_url,
                pdf_url: item.url,
                doc_type: "other",
                match_status: "unmatched",
                parsed_specs: {} as never,
                vendor: item.vendorHint,
                product_name: item.productNumber ?? null,
                error: `No PDF or product link found for "${item.productNumber}"`,
              });
              await logScrape({
                ...logBase,
                step: "search",
                status: "not_found",
                errorMessage: `No PDF or product link found for "${item.productNumber}"`,
                details: { totalLinksOnPage: scraped.links.length, sameHostLinks: candidatesLinks.length },
              });
              failed++;
            } else {
              await logScrape({
                ...logBase,
                step: "search",
                status: "info",
                errorMessage: `No direct PDF; enqueued ${productPages.length} product page(s) for follow-up`,
                details: { productPages },
              });
            }
            continue;
          }
          await logScrape({
            ...logBase,
            step: "search",
            status: "success",
            errorMessage: `Found ${chosen.length} PDF candidate(s); enqueued for download`,
            details: { chosen, totalPdfsOnPage: pdfMatches.length },
          });
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
        const more = scraped.links
          .filter((l) => looksLikeDataSheetUrl(l))
          .slice(0, 20)
          .map((u) => ({ url: u, vendorHint: item.vendorHint, pageUrl: scraped.sourceUrl }));
        enqueued.push(...more);
        await logScrape({
          ...logBase,
          step: "scrape",
          status: more.length > 0 ? "info" : "not_found",
          errorMessage:
            more.length > 0
              ? `Page returned HTML (not PDF); enqueued ${more.length} data-sheet-looking link(s)`
              : `Page returned HTML with no data-sheet links`,
          details: { enqueuedCount: more.length },
        });
        failed++;
        continue;
      }

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
          await logScrape({
            ...logBase,
            step: "download_pdf",
            status: "success",
            details: { bytes: bytes.byteLength, path },
          });
        } else {
          await logScrape({
            ...logBase,
            step: "download_pdf",
            status: "failed",
            errorMessage: `Storage upload failed: ${upErr.message}`,
          });
        }
      } else {
        await logScrape({
          ...logBase,
          step: "download_pdf",
          status: "failed",
          errorMessage: "PDF fetch returned empty/invalid bytes (not a %PDF file, over 25 MB, or HTTP error)",
        });
      }

      const vendor = fields.vendor ?? item.vendorHint;
      const product = fields.product_name ?? item.productNumber ?? null;
      let match = bestMatch(vendor, product, candidates);
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
        job_id: jobId,
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

      await logScrape({
        ...logBase,
        masterSpecId,
        dataSheetId: sheetId,
        step: "match",
        status: matchStatus === "unmatched" ? "not_found" : "success",
        errorMessage:
          matchStatus === "unmatched"
            ? `No master spec matched (best confidence ${(match?.confidence ?? 0).toFixed(2)})`
            : `Matched ${matchStatus} at confidence ${(match?.confidence ?? 0).toFixed(2)}`,
        details: {
          matchStatus,
          confidence: match?.confidence ?? null,
          extractedVendor: vendor,
          extractedProduct: product,
        },
      });

      if (matchStatus === "auto" && masterSpecId) {
        await applySheetToSpec(masterSpecId, sheetId, false);
        await logScrape({
          ...logBase,
          masterSpecId,
          dataSheetId: sheetId,
          step: "apply",
          status: "success",
          errorMessage: `Applied sheet fields + PDF pointer to master spec`,
        });
      }
      succeeded++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("data_sheets").insert({
        job_id: jobId,
        source_url: job.source_url,
        pdf_url: item.url,
        doc_type: "other",
        match_status: "unmatched",
        parsed_specs: {} as never,
        error: msg.slice(0, 500),
      });
      await logScrape({
        ...logBase,
        step: "scrape",
        status: "failed",
        errorMessage: msg,
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
    .eq("id", jobId)
    .select("*")
    .single();

  return summarize(updated ?? job, remaining, lastLabel);
}
