/*
 * Traceum — Master Spec Catalog
 *
 * Persistent canonical aerospace material spec catalog backed by the
 * Supabase `master_specs` table. Mirrors the API shape of materials.ts.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fuzzyMatch } from "@/data/materials";
import type { Material } from "@/data/materials";

export interface MasterSpec {
  id: string;
  materialNumber: number | null;
  tdsPdfPath: string | null;
  vendor: string;
  productName: string;
  productFamily: string | null;
  materialCategory: string | null;
  resinChemistry: string | null;
  reinforcement: string | null;
  productForm: string | null;
  cureTemperatureC: number | null;
  cureTime: string | null;
  dryTgOnsetC: number | null;
  wetTgC: number | null;
  peakTgC: number | null;
  maxServiceTemperatureC: number | null;
  outLifeDays: number | null;
  freezerLifeMonths: number | null;
  tmlPct: number | null;
  cvcmPct: number | null;
  tensileLapShearMpa: number | null;
  tPeelN25mm: number | null;
  flatwiseTensionMpa: number | null;
  climbingDrumPeelInLbIn: number | null;
  processMethod: string | null;
  ooaVboCapable: boolean;
  toughened: boolean;
  flameRetardant: boolean;
  lowDielectric: boolean;
  lowMoistureAbsorption: boolean;
  impactResistant: boolean;
  highTemperature: boolean;
  applications: string | null;
  qualificationsStandards: string | null;
  crossoverProduct: string | null;
  crossoverVendor: string | null;
  notes: string | null;
  minimumOrderQuantity: string | null;
  sourceDocument: string | null;
  uploadedFrom: string | null;
  frequentReorder: boolean;
  engineerDefaultName: string | null;
  profiles: string[];
  keySpecs: string[];
  customers: string[];
  tdsUrl: string | null;
  tdsSourceTitle: string | null;
  tdsScrapedAt: string | null;
  tdsScrapeStatus: "success" | "not_found" | "failed" | null;
  tdsScrapeError: string | null;
  tdsAnalyzedAt: string | null;
}

export interface MasterSpecUpload {
  fileName: string;
  uploadedAt: string;
  rowCount: number;
}

interface SpecRow {
  id: string;
  material_number: number | null;
  tds_pdf_path: string | null;
  vendor: string;
  product_name: string;
  product_family: string | null;
  material_category: string | null;
  resin_chemistry: string | null;
  reinforcement: string | null;
  product_form: string | null;
  cure_temperature_c: number | string | null;
  cure_time: string | null;
  dry_tg_onset_c: number | string | null;
  wet_tg_c: number | string | null;
  peak_tg_c: number | string | null;
  max_service_temperature_c: number | string | null;
  out_life_days: number | string | null;
  freezer_life_months: number | string | null;
  tml_pct: number | string | null;
  cvcm_pct: number | string | null;
  tensile_lap_shear_mpa: number | string | null;
  t_peel_n_per_25mm: number | string | null;
  flatwise_tension_mpa: number | string | null;
  climbing_drum_peel_in_lb_per_in: number | string | null;
  process_method: string | null;
  ooa_vbo_capable: boolean;
  toughened: boolean;
  flame_retardant: boolean;
  low_dielectric: boolean;
  low_moisture_absorption: boolean;
  impact_resistant: boolean;
  high_temperature: boolean;
  applications: string | null;
  qualifications_standards: string | null;
  crossover_product: string | null;
  crossover_vendor: string | null;
  notes: string | null;
  minimum_order_quantity: string | null;
  source_document: string | null;
  uploaded_from: string | null;
  frequent_reorder: boolean | null;
  engineer_default_name: string | null;
  profiles: string[] | null;
  key_specs: string[] | null;
  customers: string[] | null;
  tds_url: string | null;
  tds_source_title: string | null;
  tds_scraped_at: string | null;
  tds_scrape_status: string | null;
  tds_scrape_error: string | null;
}

const num = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

function rowToSpec(r: SpecRow): MasterSpec {
  return {
    id: r.id,
    materialNumber: r.material_number ?? null,
    tdsPdfPath: r.tds_pdf_path ?? null,
    vendor: r.vendor,
    productName: r.product_name,
    productFamily: r.product_family,
    materialCategory: r.material_category,
    resinChemistry: r.resin_chemistry,
    reinforcement: r.reinforcement,
    productForm: r.product_form,
    cureTemperatureC: num(r.cure_temperature_c),
    cureTime: r.cure_time,
    dryTgOnsetC: num(r.dry_tg_onset_c),
    wetTgC: num(r.wet_tg_c),
    peakTgC: num(r.peak_tg_c),
    maxServiceTemperatureC: num(r.max_service_temperature_c),
    outLifeDays: num(r.out_life_days),
    freezerLifeMonths: num(r.freezer_life_months),
    tmlPct: num(r.tml_pct),
    cvcmPct: num(r.cvcm_pct),
    tensileLapShearMpa: num(r.tensile_lap_shear_mpa),
    tPeelN25mm: num(r.t_peel_n_per_25mm),
    flatwiseTensionMpa: num(r.flatwise_tension_mpa),
    climbingDrumPeelInLbIn: num(r.climbing_drum_peel_in_lb_per_in),
    processMethod: r.process_method,
    ooaVboCapable: r.ooa_vbo_capable,
    toughened: r.toughened,
    flameRetardant: r.flame_retardant,
    lowDielectric: r.low_dielectric,
    lowMoistureAbsorption: r.low_moisture_absorption,
    impactResistant: r.impact_resistant,
    highTemperature: r.high_temperature,
    applications: r.applications,
    qualificationsStandards: r.qualifications_standards,
    crossoverProduct: r.crossover_product,
    crossoverVendor: r.crossover_vendor,
    notes: r.notes,
    minimumOrderQuantity: r.minimum_order_quantity,
    sourceDocument: r.source_document,
    uploadedFrom: r.uploaded_from,
    frequentReorder: !!r.frequent_reorder,
    engineerDefaultName: r.engineer_default_name,
    profiles: Array.isArray(r.profiles) ? r.profiles : [],
    keySpecs: Array.isArray(r.key_specs) ? r.key_specs : [],
    customers: Array.isArray(r.customers) ? r.customers : [],
    tdsUrl: r.tds_url ?? null,
    tdsSourceTitle: r.tds_source_title ?? null,
    tdsScrapedAt: r.tds_scraped_at ?? null,
    tdsScrapeStatus: (r.tds_scrape_status as MasterSpec["tdsScrapeStatus"]) ?? null,
    tdsScrapeError: r.tds_scrape_error ?? null,
  };
}

/** Case-insensitively dedupe a string array, preserving the first variant. */
function dedupeStrings(arr: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of arr) {
    if (!v) continue;
    const t = String(v).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  return Array.from(seen.values());
}

/** Treat AI placeholder "none given" and empty strings as missing. */
function isMissing(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "" || t === "none given";
  }
  return false;
}

interface SpecStore {
  specs: MasterSpec[];
  uploads: MasterSpecUpload[];
}

let _store: SpecStore = { specs: [], uploads: [] };
const _listeners = new Set<() => void>();
let _hydrated = false;
let _hydrating: Promise<void> | null = null;

function notify() {
  _listeners.forEach((fn) => fn());
}

async function hydrate(): Promise<void> {
  if (_hydrated) return;
  if (_hydrating) return _hydrating;
  _hydrating = (async () => {
    try {
      const [s, u] = await Promise.all([
        supabase.from("master_specs" as never).select("*").order("vendor").order("product_name"),
        supabase.from("master_spec_uploads" as never).select("*").order("uploaded_at", { ascending: false }),
      ]);
      if (!s.error && Array.isArray(s.data)) {
        _store = { ..._store, specs: (s.data as unknown as SpecRow[]).map(rowToSpec) };
      }
      if (!u.error && Array.isArray(u.data)) {
        _store = {
          ..._store,
          uploads: (u.data as unknown as { file_name: string; uploaded_at: string; row_count: number }[]).map((r) => ({
            fileName: r.file_name,
            uploadedAt: new Date(r.uploaded_at).toLocaleString(),
            rowCount: r.row_count,
          })),
        };
      }
      _hydrated = true;
      notify();
    } finally {
      _hydrating = null;
    }
  })();
  return _hydrating;
}

export function useMasterSpecStore(): SpecStore {
  const [snap, setSnap] = useState<SpecStore>(() => _store);
  useEffect(() => {
    const l = () => setSnap({ ..._store });
    _listeners.add(l);
    setSnap({ ..._store });
    void hydrate();
    return () => {
      _listeners.delete(l);
    };
  }, []);
  return snap;
}

export function preloadMasterSpecStore(): Promise<void> {
  return hydrate();
}

/** Force a refresh of the master spec store from the database. */
export async function refreshMasterSpecStore(): Promise<void> {
  _hydrated = false;
  await hydrate();
}

/**
 * Upsert a batch of specs (keyed on vendor + product_name) and log the upload.
 *
 * Merge semantics on duplicate (existing vendor + product_name match):
 *   - Scalar text/number/boolean fields: keep the existing value when the new
 *     row's value is missing ("none given" / null / empty); otherwise the new
 *     value wins (so users can correct stale data by re-uploading).
 *   - Array fields (key_specs, profiles): take the case-insensitive UNION of
 *     existing + new values. New key spec numbers are merged in, never lost.
 */
export async function addMasterSpecs(
  specs: Partial<MasterSpec>[],
  fileName: string,
  sourceType: "spreadsheet" | "pdf" = "spreadsheet",
) {
  await hydrate();
  const baseRaw = specs.filter((s) => s.vendor && s.productName);
  if (baseRaw.length === 0) return;

  // For every row with a crossover vendor+product, also emit a reciprocal
  // spec so both sides of a crossover sheet (e.g. Toray TC310 ↔ Hexcel
  // HexBond 650) appear as standalone entries instead of one side being
  // hidden inside the other's metadata.
  const cleanText = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const low = s.toLowerCase();
    if (low === "none given" || low === "n/a" || low === "—" || low === "-") return null;
    if (low.includes("no direct") || low.includes("no equivalent") || low.includes("not listed")) return null;
    if (low.includes("multiple") || low.includes("various")) return null;
    return s;
  };
  const stripParens = (s: string) => s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();

  const incomingRaw: Partial<MasterSpec>[] = [...baseRaw];
  for (const s of baseRaw) {
    const cv = cleanText(s.crossoverVendor);
    const cp = cleanText(s.crossoverProduct);
    if (!cv || !cp) continue;
    const vendor = stripParens(cv.split(/[,/|]/)[0] || cv);
    const product = cp.split(/\s*\/\s*/)[0].trim();
    if (!vendor || !product) continue;
    incomingRaw.push({
      vendor,
      productName: product,
      crossoverVendor: s.vendor,
      crossoverProduct: s.productName,
      materialCategory: s.materialCategory ?? null,
      resinChemistry: s.resinChemistry ?? null,
      productForm: s.productForm ?? null,
      reinforcement: s.reinforcement ?? null,
      notes: s.notes
        ? `Crossover of ${s.vendor} ${s.productName}. ${s.notes}`
        : `Crossover of ${s.vendor} ${s.productName}.`,
    });
  }


  const keyOf = (vendor: string, product: string) =>
    `${vendor.trim().toLowerCase()}||${product.trim().toLowerCase()}`;

  // Dedupe incoming batch — Postgres upsert with ON CONFLICT errors out if the
  // same conflict target appears twice in one statement. Merge duplicates by
  // letting later values win for scalars and unioning array fields.
  const mergedMap = new Map<string, Partial<MasterSpec>>();
  for (const s of incomingRaw) {
    const k = keyOf(s.vendor!, s.productName!);
    const prev = mergedMap.get(k);
    if (!prev) {
      mergedMap.set(k, { ...s });
      continue;
    }
    const merged: Partial<MasterSpec> = { ...prev };
    for (const [field, val] of Object.entries(s) as [keyof MasterSpec, unknown][]) {
      if (val === undefined || val === null || val === "") continue;
      if (Array.isArray(val)) {
        const existingArr = Array.isArray((merged as Record<string, unknown>)[field])
          ? ((merged as Record<string, unknown>)[field] as string[])
          : [];
        (merged as Record<string, unknown>)[field] = Array.from(
          new Set([...existingArr, ...(val as string[])].map((x) => String(x))),
        );
      } else {
        (merged as Record<string, unknown>)[field] = val;
      }
    }
    mergedMap.set(k, merged);
  }
  const incoming = Array.from(mergedMap.values());
  const wanted = Array.from(mergedMap.keys());

  const vendors = Array.from(new Set(incoming.map((s) => s.vendor!.trim())));
  const products = Array.from(new Set(incoming.map((s) => s.productName!.trim())));
  const existingMap = new Map<string, MasterSpec>();
  // Chunk the IN() filter to avoid URL-length limits on large uploads.
  const LOOKUP_CHUNK = 200;
  for (let i = 0; i < vendors.length; i += LOOKUP_CHUNK) {
    const vChunk = vendors.slice(i, i + LOOKUP_CHUNK);
    for (let j = 0; j < products.length; j += LOOKUP_CHUNK) {
      const pChunk = products.slice(j, j + LOOKUP_CHUNK);
      const existingResp = await supabase
        .from("master_specs" as never)
        .select("*")
        .in("vendor", vChunk as never)
        .in("product_name", pChunk as never);
      if (!existingResp.error && Array.isArray(existingResp.data)) {
        for (const r of existingResp.data as unknown as SpecRow[]) {
          const k = keyOf(r.vendor, r.product_name);
          if (wanted.includes(k)) existingMap.set(k, rowToSpec(r));
        }
      }
    }
  }

  const pickText = (incomingV: unknown, existingV: string | null): string | null => {
    if (!isMissing(incomingV)) return String(incomingV);
    return existingV;
  };
  const pickNum = (incomingV: number | null | undefined, existingV: number | null) =>
    incomingV === null || incomingV === undefined ? existingV : incomingV;
  const pickBool = (incomingV: boolean | undefined, existingV: boolean) =>
    incomingV === undefined ? existingV : !!incomingV;

  const rows = incoming.map((s) => {
    const existing = existingMap.get(keyOf(s.vendor!, s.productName!));
    const e = existing ?? null;
    return {
      vendor: s.vendor!,
      product_name: s.productName!,
      product_family: pickText(s.productFamily, e?.productFamily ?? null),
      material_category: pickText(s.materialCategory, e?.materialCategory ?? null),
      resin_chemistry: pickText(s.resinChemistry, e?.resinChemistry ?? null),
      reinforcement: pickText(s.reinforcement, e?.reinforcement ?? null),
      product_form: pickText(s.productForm, e?.productForm ?? null),
      cure_temperature_c: pickNum(s.cureTemperatureC, e?.cureTemperatureC ?? null),
      cure_time: pickText(s.cureTime, e?.cureTime ?? null),
      dry_tg_onset_c: pickNum(s.dryTgOnsetC, e?.dryTgOnsetC ?? null),
      wet_tg_c: pickNum(s.wetTgC, e?.wetTgC ?? null),
      peak_tg_c: pickNum(s.peakTgC, e?.peakTgC ?? null),
      max_service_temperature_c: pickNum(s.maxServiceTemperatureC, e?.maxServiceTemperatureC ?? null),
      out_life_days: pickNum(s.outLifeDays, e?.outLifeDays ?? null),
      freezer_life_months: pickNum(s.freezerLifeMonths, e?.freezerLifeMonths ?? null),
      tml_pct: pickNum(s.tmlPct, e?.tmlPct ?? null),
      cvcm_pct: pickNum(s.cvcmPct, e?.cvcmPct ?? null),
      tensile_lap_shear_mpa: pickNum(s.tensileLapShearMpa, e?.tensileLapShearMpa ?? null),
      t_peel_n_per_25mm: pickNum(s.tPeelN25mm, e?.tPeelN25mm ?? null),
      flatwise_tension_mpa: pickNum(s.flatwiseTensionMpa, e?.flatwiseTensionMpa ?? null),
      climbing_drum_peel_in_lb_per_in: pickNum(s.climbingDrumPeelInLbIn, e?.climbingDrumPeelInLbIn ?? null),
      process_method: pickText(s.processMethod, e?.processMethod ?? null),
      ooa_vbo_capable: pickBool(s.ooaVboCapable, e?.ooaVboCapable ?? false),
      toughened: pickBool(s.toughened, e?.toughened ?? false),
      flame_retardant: pickBool(s.flameRetardant, e?.flameRetardant ?? false),
      low_dielectric: pickBool(s.lowDielectric, e?.lowDielectric ?? false),
      low_moisture_absorption: pickBool(s.lowMoistureAbsorption, e?.lowMoistureAbsorption ?? false),
      impact_resistant: pickBool(s.impactResistant, e?.impactResistant ?? false),
      high_temperature: pickBool(s.highTemperature, e?.highTemperature ?? false),
      applications: pickText(s.applications, e?.applications ?? null),
      qualifications_standards: pickText(s.qualificationsStandards, e?.qualificationsStandards ?? null),
      crossover_product: pickText(s.crossoverProduct, e?.crossoverProduct ?? null),
      crossover_vendor: pickText(s.crossoverVendor, e?.crossoverVendor ?? null),
      notes: pickText(s.notes, e?.notes ?? null),
      minimum_order_quantity: pickText(s.minimumOrderQuantity, e?.minimumOrderQuantity ?? null),
      source_document: pickText(s.sourceDocument, e?.sourceDocument ?? null),
      uploaded_from: fileName,
      profiles: dedupeStrings([...(e?.profiles ?? []), ...(Array.isArray(s.profiles) ? s.profiles : [])]),
      key_specs: dedupeStrings([...(e?.keySpecs ?? []), ...(Array.isArray(s.keySpecs) ? s.keySpecs : [])]),
      customers: dedupeStrings([...(e?.customers ?? []), ...(Array.isArray(s.customers) ? s.customers : [])]),
    };
  });

  // Chunk the upsert — single huge payloads can hit body-size limits and
  // make failures harder to attribute.
  const UPSERT_CHUNK = 250;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const up = await supabase
      .from("master_specs" as never)
      .upsert(chunk as never, { onConflict: "vendor,product_name" });
    if (up.error) {
      const e = up.error as { message?: string; details?: string; hint?: string; code?: string };
      const parts = [e.message, e.details, e.hint, e.code ? `(${e.code})` : null].filter(Boolean);
      throw new Error(parts.join(" — ") || "Database upsert failed");
    }
  }

  await supabase.from("master_spec_uploads" as never).insert({
    file_name: fileName,
    row_count: rows.length,
    source_type: sourceType,
  } as never);

  // Refresh from DB to get authoritative IDs
  _hydrated = false;
  await hydrate();
}

/** Toggle the frequent-reorder star on a master spec. */
export async function setFrequentReorder(specId: string, value: boolean, engineerName?: string) {
  const patch: Record<string, unknown> = { frequent_reorder: value };
  if (value && engineerName) patch.engineer_default_name = engineerName;
  const { error } = await supabase
    .from("master_specs" as never)
    .update(patch as never)
    .eq("id", specId);
  if (error) throw error;
  // Optimistic local update
  _store = {
    ..._store,
    specs: _store.specs.map((s) =>
      s.id === specId
        ? { ...s, frequentReorder: value, engineerDefaultName: engineerName ?? s.engineerDefaultName }
        : s,
    ),
  };
  notify();
}

/** Lookup the inventory match for a master spec. */
export type InventoryMatch =
  | { status: "in-stock"; material: Material }
  | { status: "tracked"; material: Material }
  | { status: "none" };

const inventoryMatchCache = new WeakMap<Material[], WeakMap<MasterSpec, InventoryMatch>>();

export function getInventoryMatch(spec: MasterSpec, materials: Material[]): InventoryMatch {
  const cachedForMaterials = inventoryMatchCache.get(materials);
  const cached = cachedForMaterials?.get(spec);
  if (cached) return cached;

  const sameVendor = materials.filter(
    (m) => m.supplier && m.supplier.toLowerCase() === (spec.vendor ?? "").toLowerCase(),
  );
  const pool = sameVendor.length > 0 ? sameVendor : materials;
  const match = pool.find((m) => fuzzyMatch(m.product, spec.productName));
  const result: InventoryMatch = !match
    ? { status: "none" }
    : { status: match.availableQty > 0 ? "in-stock" : "tracked", material: match };
  const nextCache = cachedForMaterials ?? new WeakMap<MasterSpec, InventoryMatch>();
  nextCache.set(spec, result);
  if (!cachedForMaterials) inventoryMatchCache.set(materials, nextCache);
  return result;
}
