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
}

export interface MasterSpecUpload {
  fileName: string;
  uploadedAt: string;
  rowCount: number;
}

interface SpecRow {
  id: string;
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
}

const num = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

function rowToSpec(r: SpecRow): MasterSpec {
  return {
    id: r.id,
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
  };
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

/** Upsert a batch of specs (keyed on vendor + product_name) and log the upload. */
export async function addMasterSpecs(
  specs: Partial<MasterSpec>[],
  fileName: string,
  sourceType: "spreadsheet" | "pdf" = "spreadsheet",
) {
  await hydrate();
  const rows = specs
    .filter((s) => s.vendor && s.productName)
    .map((s) => ({
      vendor: s.vendor!,
      product_name: s.productName!,
      product_family: s.productFamily ?? null,
      material_category: s.materialCategory ?? null,
      resin_chemistry: s.resinChemistry ?? null,
      reinforcement: s.reinforcement ?? null,
      product_form: s.productForm ?? null,
      cure_temperature_c: s.cureTemperatureC ?? null,
      cure_time: s.cureTime ?? null,
      dry_tg_onset_c: s.dryTgOnsetC ?? null,
      wet_tg_c: s.wetTgC ?? null,
      peak_tg_c: s.peakTgC ?? null,
      max_service_temperature_c: s.maxServiceTemperatureC ?? null,
      out_life_days: s.outLifeDays ?? null,
      freezer_life_months: s.freezerLifeMonths ?? null,
      tml_pct: s.tmlPct ?? null,
      cvcm_pct: s.cvcmPct ?? null,
      tensile_lap_shear_mpa: s.tensileLapShearMpa ?? null,
      t_peel_n_per_25mm: s.tPeelN25mm ?? null,
      flatwise_tension_mpa: s.flatwiseTensionMpa ?? null,
      climbing_drum_peel_in_lb_per_in: s.climbingDrumPeelInLbIn ?? null,
      process_method: s.processMethod ?? null,
      ooa_vbo_capable: !!s.ooaVboCapable,
      toughened: !!s.toughened,
      flame_retardant: !!s.flameRetardant,
      low_dielectric: !!s.lowDielectric,
      low_moisture_absorption: !!s.lowMoistureAbsorption,
      impact_resistant: !!s.impactResistant,
      high_temperature: !!s.highTemperature,
      applications: s.applications ?? null,
      qualifications_standards: s.qualificationsStandards ?? null,
      crossover_product: s.crossoverProduct ?? null,
      crossover_vendor: s.crossoverVendor ?? null,
      notes: s.notes ?? null,
      minimum_order_quantity: s.minimumOrderQuantity ?? null,
      source_document: s.sourceDocument ?? null,
      uploaded_from: fileName,
      profiles: Array.isArray(s.profiles) ? s.profiles : [],
    }));

  if (rows.length === 0) return;

  const up = await supabase
    .from("master_specs" as never)
    .upsert(rows as never, { onConflict: "vendor,product_name" });
  if (up.error) throw up.error;

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

export function getInventoryMatch(spec: MasterSpec, materials: Material[]): InventoryMatch {
  const sameVendor = materials.filter(
    (m) => m.supplier && m.supplier.toLowerCase() === spec.vendor.toLowerCase(),
  );
  const pool = sameVendor.length > 0 ? sameVendor : materials;
  const match = pool.find((m) => fuzzyMatch(m.product, spec.productName));
  if (!match) return { status: "none" };
  return { status: match.availableQty > 0 ? "in-stock" : "tracked", material: match };
}
