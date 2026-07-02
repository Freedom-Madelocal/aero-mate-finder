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

    const firstToken = (s: string) => s.split(" ").filter(Boolean)[0] ?? "";

    type SpecRef = {
      id: string;
      vendor: string;
      product: string;
      vendorKey: string;
      productKey: string;
      existing: number | null;
    };
    const byVendorProduct = new Map<string, SpecRef[]>();
    const byProductOnly = new Map<string, SpecRef[]>();
    const refs: SpecRef[] = [];
    for (const s of specs ?? []) {
      const ref: SpecRef = {
        id: s.id,
        vendor: s.vendor,
        product: s.product_name,
        vendorKey: norm(s.vendor),
        productKey: stripVendorPrefix(s.vendor, s.product_name),
        existing: s.material_number,
      };
      refs.push(ref);
      const prodKey = stripVendorPrefix(s.vendor, s.product_name);
      const vendorProductKey = `${norm(s.vendor)}|${prodKey}`;
      const vendorProductList = byVendorProduct.get(vendorProductKey) ?? [];
      vendorProductList.push(ref);
      byVendorProduct.set(vendorProductKey, vendorProductList);
      const list = byProductOnly.get(prodKey) ?? [];
      list.push(ref);
      byProductOnly.set(prodKey, list);
    }

    const scoreCandidate = (rowVendor: string, rowProduct: string, ref: SpecRef) => {
      const rowVendorKey = norm(rowVendor);
      const rowProductKey = stripVendorPrefix(rowVendor, rowProduct);
      let score = 0;

      if (ref.vendorKey === rowVendorKey) score += 1000;
      else if (ref.vendorKey && rowProductKey.includes(ref.vendorKey)) score += 300;
      else if (rowVendorKey && ref.productKey.includes(rowVendorKey)) score += 300;
      else return -1;

      if (ref.productKey === rowProductKey) return score + 10000;
      if (rowProductKey.startsWith(`${ref.productKey} `)) return score + 5000 + ref.productKey.length;
      if (ref.productKey.startsWith(`${rowProductKey} `)) return score + 3000 + rowProductKey.length;

      // The INDEX CSV often appends descriptors after the product code:
      // "1035 Hexcel E-Glass E595" should match DB product "1035".
      const code = firstToken(rowProductKey);
      if (code && (ref.productKey === code || ref.productKey.startsWith(`${code} `))) {
        return score + 1500 + code.length;
      }

      return -1;
    };

    const findBestSpec = (rowVendor: string, rowProduct: string) => {
      const rowProdKey = stripVendorPrefix(rowVendor, rowProduct);
      const exact = byVendorProduct.get(`${norm(rowVendor)}|${rowProdKey}`);
      if (exact && exact.length === 1) return { hit: exact[0], ambiguous: false };
      if (exact && exact.length > 1) return { hit: null, ambiguous: true };

      const productOnly = byProductOnly.get(rowProdKey);
      if (productOnly && productOnly.length === 1) return { hit: productOnly[0], ambiguous: false };

      let best: SpecRef | null = null;
      let bestScore = -1;
      let tied = false;
      for (const ref of refs) {
        const score = scoreCandidate(rowVendor, rowProduct, ref);
        if (score > bestScore) {
          best = ref;
          bestScore = score;
          tied = false;
        } else if (score === bestScore && score >= 0) {
          tied = true;
        }
      }
      return { hit: bestScore >= 0 && !tied ? best : null, ambiguous: bestScore >= 0 && tied };
    };

    let matched = 0;
    let alreadySet = 0;
    let conflicted = 0;
    const unmatched: { materialNumber: number; vendor: string; product: string }[] = [];
    const updates: { id: string; material_number: number }[] = [];
    const plannedBySpecId = new Map<string, number>();

    for (const row of data.rows) {
      const { hit, ambiguous } = findBestSpec(row.vendor, row.product);
      if (!hit) {
        unmatched.push({
          materialNumber: row.materialNumber,
          vendor: row.vendor,
          product: ambiguous ? `${row.product} (ambiguous match)` : row.product,
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
      const plannedNumber = plannedBySpecId.get(hit.id);
      if (plannedNumber != null && plannedNumber !== row.materialNumber) {
        conflicted++;
        continue;
      }
      plannedBySpecId.set(hit.id, row.materialNumber);
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
