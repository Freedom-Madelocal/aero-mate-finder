import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "tds-pdfs";

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AdminClient = Awaited<ReturnType<typeof getAdminClient>>;

async function assertSuperAdmin(userId: string, supabaseAdmin: AdminClient): Promise<void> {
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
    const supabaseAdmin = await getAdminClient();
    await assertSuperAdmin(context.userId, supabaseAdmin);

    const { data: specs, error } = await supabaseAdmin
      .from("master_specs")
      .select("id, vendor, product_name, material_number");
    if (error) throw new Error(error.message);

    // Aggressive normalization: strip ®™©, unicode-fold, drop punctuation,
    // collapse whitespace. Handles "HexForce®" vs "hexforce", "5H Satin"
    // vs "5h-satin", curly vs straight quotes, etc.
    const norm = (s: string) =>
      s
        .normalize("NFKD")
        .replace(/[®™©]/g, "")
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    // Some DB product names embed the vendor as a prefix
    // ("HexForce® 43596 ..."). Strip it so CSVs without the prefix match.
    const stripVendorPrefix = (vendor: string, product: string) => {
      const v = norm(vendor);
      const p = norm(product);
      if (v && p.startsWith(v + " ")) return p.slice(v.length + 1);
      return p;
    };

    type SpecRef = { id: string; existing: number | null };
    const byVendorProduct = new Map<string, SpecRef>();
    const byProductOnly = new Map<string, SpecRef[]>();
    for (const s of specs ?? []) {
      const ref: SpecRef = { id: s.id, existing: s.material_number };
      const prodKey = stripVendorPrefix(s.vendor, s.product_name);
      byVendorProduct.set(`${norm(s.vendor)}|${prodKey}`, ref);
      const list = byProductOnly.get(prodKey) ?? [];
      list.push(ref);
      byProductOnly.set(prodKey, list);
    }

    let matched = 0;
    let alreadySet = 0;
    let conflicted = 0;
    const unmatched: { materialNumber: number; vendor: string; product: string }[] = [];
    const updates: { id: string; material_number: number }[] = [];

    for (const row of data.rows) {
      const rowProdKey = stripVendorPrefix(row.vendor, row.product);
      let hit = byVendorProduct.get(`${norm(row.vendor)}|${rowProdKey}`);
      // Fallback: vendor names differ (CSV "Hexcel" vs DB "HexForce")
      // but the product name uniquely identifies the spec.
      if (!hit) {
        const candidates = byProductOnly.get(rowProdKey);
        if (candidates && candidates.length === 1) hit = candidates[0];
      }
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
 * Preflight selected PDF Material IDs before requesting signed upload URLs.
 * Missing IDs are expected user/data issues, so return them instead of throwing
 * and triggering the runtime overlay during large folder uploads.
 */
export const validateTdsMaterialNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        materialNumbers: z.array(z.number().int().min(1).max(100000)).min(1).max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdminClient();
    await assertSuperAdmin(context.userId, supabaseAdmin);

    const requested = [...new Set(data.materialNumbers)];
    const { data: specs, error } = await supabaseAdmin
      .from("master_specs")
      .select("material_number")
      .in("material_number", requested);
    if (error) throw new Error(error.message);

    const existingSet = new Set(
      (specs ?? [])
        .map((s) => s.material_number)
        .filter((n): n is number => typeof n === "number"),
    );
    return {
      existing: requested.filter((n) => existingSet.has(n)),
      missing: requested.filter((n) => !existingSet.has(n)),
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
    const supabaseAdmin = await getAdminClient();
    await assertSuperAdmin(context.userId, supabaseAdmin);

    // Confirm the material_number exists.
    const { data: spec, error: specErr } = await supabaseAdmin
      .from("master_specs")
      .select("id, tds_pdf_path")
      .eq("material_number", data.materialNumber)
      .maybeSingle();
    if (specErr) throw new Error(specErr.message);
    if (!spec) {
      return {
        ok: false as const,
        code: "MISSING_MATERIAL",
        message: `Material ID ${data.materialNumber} is not assigned to any master spec. Run Assign Material IDs first or resolve this CSV row before uploading.`,
        materialNumber: data.materialNumber,
      };
    }

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const paddedNum = String(data.materialNumber).padStart(4, "0");
    const path = `${paddedNum}/${safeName}`;

    // Check for prior objects in this material's folder.
    const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list(paddedNum);
    const hasExisting = (existing?.length ?? 0) > 0 || !!spec.tds_pdf_path;

    if (hasExisting && !data.replaceExisting) {
      // Signal "already exists — skipped" without failing the whole batch.
      return {
        ok: false as const,
        code: "EXISTS",
        message: "Already has a PDF — enable Replace to overwrite",
        materialNumber: data.materialNumber,
      };
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
      ok: true as const,
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
    const supabaseAdmin = await getAdminClient();
    await assertSuperAdmin(context.userId, supabaseAdmin);
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
    const supabaseAdmin = await getAdminClient();
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(data.path, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign download URL");
    return { url: signed.signedUrl };
  });
