import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "tds-pdfs";

async function assertSuperAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r) => r.role === "super_admin")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/**
 * Import the INDEX CSV: assign material_number on master_specs by joining
 * on (vendor, product_name), case-insensitive and whitespace-normalized.
 * Returns matched / unmatched / already-set counts and an unmatched list.
 */
export const importMaterialIndex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              materialNumber: z.number().int().min(1).max(100000),
              vendor: z.string().min(1),
              product: z.string().min(1),
              pdfFilename: z.string().nullable().optional(),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { data: specs, error } = await supabaseAdmin
      .from("master_specs")
      .select("id, vendor, product_name, material_number");
    if (error) throw new Error(error.message);

    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const byKey = new Map<string, { id: string; existing: number | null }>();
    for (const s of specs ?? []) {
      byKey.set(`${norm(s.vendor)}|${norm(s.product_name)}`, {
        id: s.id,
        existing: s.material_number,
      });
    }

    let matched = 0;
    let alreadySet = 0;
    let conflicted = 0;
    const unmatched: { materialNumber: number; vendor: string; product: string }[] = [];
    const updates: { id: string; material_number: number }[] = [];

    for (const row of data.rows) {
      const hit = byKey.get(`${norm(row.vendor)}|${norm(row.product)}`);
      if (!hit) {
        unmatched.push({
          materialNumber: row.materialNumber,
          vendor: row.vendor,
          product: row.product,
        });
        continue;
      }
      if (hit.existing != null && hit.existing !== row.materialNumber) {
        conflicted++;
        continue;
      }
      if (hit.existing === row.materialNumber) {
        alreadySet++;
        continue;
      }
      updates.push({ id: hit.id, material_number: row.materialNumber });
    }

    // Apply updates one-by-one (unique index enforces integrity).
    for (const u of updates) {
      const { error: upErr } = await supabaseAdmin
        .from("master_specs")
        .update({ material_number: u.material_number })
        .eq("id", u.id);
      if (upErr) throw new Error(upErr.message);
      matched++;
    }

    return {
      totalRows: data.rows.length,
      matched,
      alreadySet,
      conflicted,
      unmatched,
    };
  });

/**
 * Request a signed upload URL for a PDF file scoped to a specific material.
 * The client then does a PUT directly to Supabase Storage.
 */
export const createTdsUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        materialNumber: z.number().int().min(1).max(100000),
        fileName: z.string().min(1).max(255),
        replaceExisting: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    // Confirm the material_number exists.
    const { data: spec, error: specErr } = await supabaseAdmin
      .from("master_specs")
      .select("id, tds_pdf_path")
      .eq("material_number", data.materialNumber)
      .maybeSingle();
    if (specErr) throw new Error(specErr.message);
    if (!spec) throw new Error(`No master spec with material_number ${data.materialNumber}`);

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const paddedNum = String(data.materialNumber).padStart(4, "0");
    const path = `${paddedNum}/${safeName}`;

    // Check for prior objects in this material's folder.
    const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list(paddedNum);
    const hasExisting = (existing?.length ?? 0) > 0 || !!spec.tds_pdf_path;

    if (hasExisting && !data.replaceExisting) {
      // Signal "already exists — skipped" without failing the whole batch.
      throw new Error("EXISTS: A PDF is already attached to this Material ID.");
    }

    if (existing && existing.length > 0) {
      await supabaseAdmin.storage
        .from(BUCKET)
        .remove(existing.map((o) => `${paddedNum}/${o.name}`));
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Failed to sign upload URL");

    return {
      specId: spec.id,
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      replaced: hasExisting,
    };
  });

/**
 * After the client PUTs the PDF, call this to write the path back onto the spec.
 */
export const finalizeTdsUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        specId: z.string().uuid(),
        path: z.string().min(1),
        size: z.number().int().nonnegative(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("master_specs")
      .update({
        tds_pdf_path: data.path,
        tds_pdf_size: data.size,
        tds_pdf_downloaded_at: new Date().toISOString(),
      })
      .eq("id", data.specId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Return a short-lived signed download URL for any authenticated user.
 * (RLS on storage.objects requires authenticated; this fn requires auth too.)
 */
export const getTdsDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign download URL");
    return { url: signed.signedUrl };
  });
