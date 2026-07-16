import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SpecIdSchema = z.object({ specId: z.string().uuid() });

export type SpecAuditPayload = {
  spec: {
    id: string;
    materialNumber: number | null;
    vendor: string;
    productName: string;
    sourceDocument: string | null;
    uploadedFrom: string | null;
    createdAt: string;
    updatedAt: string;
    tdsUrl: string | null;
    tdsSourceTitle: string | null;
    tdsScrapedAt: string | null;
    tdsScrapeStatus: string | null;
    tdsScrapeError: string | null;
    tdsPdfPath: string | null;
    tdsPdfSize: number | null;
    tdsPdfDownloadedAt: string | null;
    tdsAnalyzedAt: string | null;
  };
  upload: {
    id: string;
    fileName: string;
    uploadedAt: string;
    rowCount: number | null;
    sourceType: string | null;
  } | null;
  scrapeLogs: Array<{
    id: string;
    createdAt: string;
    step: string;
    status: string | null;
    vendor: string | null;
    productName: string | null;
    sourceUrl: string | null;
    attemptedUrl: string | null;
    httpStatus: number | null;
    errorMessage: string | null;
    details: string | null;
  }>;
  analysisItems: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    attempts: number;
    maxAttempts: number | null;
    errorClass: string | null;
    error: string | null;
    model: string | null;
    promptVersion: string | null;
    latencyMs: number | null;
    updatedFields: string[] | null;
    documentHash: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    nextRunAt: string | null;
  }>;
  provenance: Array<{
    field: string;
    valueText: string | null;
    valueNum: number | null;
    valueBool: boolean | null;
    unit: string | null;
    sourcePage: number | null;
    sourceQuote: string | null;
    confidence: number | null;
    model: string | null;
    promptVersion: string | null;
    extractedAt: string | null;
  }>;
};

export const getSpecAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SpecIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<SpecAuditPayload> => {
    // Super admin only.
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden: super_admin only.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const specRes = await supabaseAdmin
      .from("master_specs")
      .select(
        "id, material_number, vendor, product_name, source_document, uploaded_from, created_at, updated_at, tds_url, tds_source_title, tds_scraped_at, tds_scrape_status, tds_scrape_error, tds_pdf_path, tds_pdf_size, tds_pdf_downloaded_at, tds_analyzed_at",
      )
      .eq("id", data.specId)
      .maybeSingle();
    if (specRes.error) throw new Error(specRes.error.message);
    if (!specRes.data) throw new Error("Spec not found");
    const s = specRes.data;

    const fileName = s.source_document ?? s.uploaded_from ?? null;
    const uploadRes = fileName
      ? await supabaseAdmin
          .from("master_spec_uploads")
          .select("id, file_name, uploaded_at, row_count, source_type")
          .eq("file_name", fileName)
          .order("uploaded_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null;

    const [logsRes, itemsRes, provRes] = await Promise.all([
      supabaseAdmin
        .from("scrape_logs")
        .select(
          "id, created_at, step, status, vendor, product_name, source_url, attempted_url, http_status, error_message, details",
        )
        .eq("master_spec_id", data.specId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("tds_analysis_items")
        .select(
          "id, created_at, updated_at, status, attempts, max_attempts, error_class, error, model, prompt_version, latency_ms, updated_fields, document_hash, input_tokens, output_tokens, cost_usd, next_run_at",
        )
        .eq("spec_id", data.specId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("tds_field_provenance")
        .select(
          "field, value_text, value_num, value_bool, unit, source_page, source_quote, confidence, model, prompt_version, extracted_at",
        )
        .eq("spec_id", data.specId)
        .order("extracted_at", { ascending: false }),
    ]);

    return {
      spec: {
        id: s.id,
        materialNumber: s.material_number ?? null,
        vendor: s.vendor,
        productName: s.product_name,
        sourceDocument: s.source_document ?? null,
        uploadedFrom: s.uploaded_from ?? null,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        tdsUrl: s.tds_url ?? null,
        tdsSourceTitle: s.tds_source_title ?? null,
        tdsScrapedAt: s.tds_scraped_at ?? null,
        tdsScrapeStatus: s.tds_scrape_status ?? null,
        tdsScrapeError: s.tds_scrape_error ?? null,
        tdsPdfPath: s.tds_pdf_path ?? null,
        tdsPdfSize: s.tds_pdf_size ?? null,
        tdsPdfDownloadedAt: s.tds_pdf_downloaded_at ?? null,
        tdsAnalyzedAt: s.tds_analyzed_at ?? null,
      },
      upload: uploadRes?.data
        ? {
            id: uploadRes.data.id,
            fileName: uploadRes.data.file_name,
            uploadedAt: uploadRes.data.uploaded_at,
            rowCount: uploadRes.data.row_count ?? null,
            sourceType: uploadRes.data.source_type ?? null,
          }
        : null,
      scrapeLogs: (logsRes.data ?? []).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        step: r.step,
        status: r.status ?? null,
        vendor: r.vendor ?? null,
        productName: r.product_name ?? null,
        sourceUrl: r.source_url ?? null,
        attemptedUrl: r.attempted_url ?? null,
        httpStatus: r.http_status ?? null,
        errorMessage: r.error_message ?? null,
        details: r.details == null ? null : typeof r.details === "string" ? r.details : JSON.stringify(r.details),
      })),
      analysisItems: (itemsRes.data ?? []).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        status: r.status,
        attempts: r.attempts,
        maxAttempts: r.max_attempts ?? null,
        errorClass: r.error_class ?? null,
        error: r.error ?? null,
        model: r.model ?? null,
        promptVersion: r.prompt_version ?? null,
        latencyMs: r.latency_ms ?? null,
        updatedFields: (r.updated_fields as string[] | null) ?? null,
        documentHash: r.document_hash ?? null,
        inputTokens: r.input_tokens ?? null,
        outputTokens: r.output_tokens ?? null,
        costUsd: r.cost_usd ? Number(r.cost_usd) : null,
        nextRunAt: r.next_run_at ?? null,
      })),
      provenance: (provRes.data ?? []).map((r) => ({
        field: r.field,
        valueText: r.value_text ?? null,
        valueNum: r.value_num !== null && r.value_num !== undefined ? Number(r.value_num) : null,
        valueBool: r.value_bool ?? null,
        unit: r.unit ?? null,
        sourcePage: r.source_page ?? null,
        sourceQuote: r.source_quote ?? null,
        confidence: r.confidence !== null && r.confidence !== undefined ? Number(r.confidence) : null,
        model: r.model ?? null,
        promptVersion: r.prompt_version ?? null,
        extractedAt: r.extracted_at ?? null,
      })),
    };
  });
