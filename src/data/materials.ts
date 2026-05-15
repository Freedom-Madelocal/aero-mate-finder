/*
 * Traceum — Material Data Layer
 *
 * Persistent backend: data lives in Supabase (tables `materials` and
 * `stock_reports`). This module keeps the original in-memory store API
 * (useMaterialStore / addMaterials / clearAllData / getStore) so existing
 * pages keep working, but every mutation is mirrored to Supabase and the
 * store is hydrated from Supabase on first use.
 *
 * Lots, COA, and COC records are not yet persisted (no source of truth
 * exists for them yet) and remain in-memory placeholders.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Type Definitions ───────────────────────────────────────────────

export interface MaterialLot {
  lotId: string;
  materialId: string;
  quantity: number;
  unit: string;
  receivedDate: string;
  expirationDate: string;
  freezerLife: number;
  outTime: number;
  maxOutTime: number;
  location: string;
  status: "compliant" | "warning" | "critical" | "expired";
  coaId: string;
  cocId: string;
}

export interface COARecord {
  id: string;
  lotId: string;
  materialId: string;
  issueDate: string;
  manufacturer: string;
  batchNumber: string;
  testResults: {
    property: string;
    value: string;
    unit: string;
    spec: string;
    pass: boolean;
  }[];
  shelfLife: string;
  storageConditions: string;
  certifiedBy: string;
  documentUrl: string;
}

export interface COCRecord {
  id: string;
  lotId: string;
  materialId: string;
  issueDate: string;
  customer: string;
  orderNumber: string;
  shipDate: string;
  chainOfCustody: {
    event: string;
    timestamp: string;
    actor: string;
    location: string;
    temp?: string;
  }[];
  complianceStatements: string[];
  signedBy: string;
  documentUrl: string;
}

export interface Material {
  id: string;
  supplier: string;
  product: string;
  formerName: string | null;
  form: string;
  chemistry: string;
  maxServiceTemp: string;
  cureTemp: string;
  ooaCapable: string;
  nasaE595: string;
  notes: string | null;
  availableQty: number;
  availableUnit: string;
  incomingQty: number;
  incomingEta: string | null;
  totalLots: number;
  activeLots: number;
  customFields?: Record<string, string>;
  source?: "manual" | "stock-report";
  stockReportName?: string;
}

export interface StockReportRecord {
  fileName: string;
  uploadedAt: string;
  rowCount: number;
  customColumns: string[];
}

interface MaterialStore {
  materials: Material[];
  lots: MaterialLot[];
  coaRecords: COARecord[];
  cocRecords: COCRecord[];
  stockReports: StockReportRecord[];
}

// ─── Reactive Store (in-memory cache, hydrated from Supabase) ───────

let _store: MaterialStore = {
  materials: [],
  lots: [],
  coaRecords: [],
  cocRecords: [],
  stockReports: [],
};
const _listeners = new Set<() => void>();
let _hydrated = false;
let _hydrating: Promise<void> | null = null;

function notify() {
  _listeners.forEach((fn) => fn());
}

export function getStore(): MaterialStore {
  return _store;
}

// ─── Supabase row mapping ───────────────────────────────────────────

type MaterialRow = {
  id: string;
  supplier: string;
  product: string;
  former_name: string | null;
  form: string;
  chemistry: string;
  max_service_temp: string;
  cure_temp: string;
  ooa_capable: string;
  nasa_e595: string;
  notes: string | null;
  available_qty: number | string;
  available_unit: string;
  incoming_qty: number | string;
  incoming_eta: string | null;
  total_lots: number;
  active_lots: number;
  custom_fields: Record<string, string> | null;
  source: string | null;
  stock_report_name: string | null;
};

type StockReportRow = {
  file_name: string;
  uploaded_at: string;
  row_count: number;
  custom_columns: string[] | null;
};

function rowToMaterial(r: MaterialRow): Material {
  return {
    id: r.id,
    supplier: r.supplier,
    product: r.product,
    formerName: r.former_name,
    form: r.form,
    chemistry: r.chemistry,
    maxServiceTemp: r.max_service_temp,
    cureTemp: r.cure_temp,
    ooaCapable: r.ooa_capable,
    nasaE595: r.nasa_e595,
    notes: r.notes,
    availableQty: Number(r.available_qty) || 0,
    availableUnit: r.available_unit,
    incomingQty: Number(r.incoming_qty) || 0,
    incomingEta: r.incoming_eta,
    totalLots: r.total_lots,
    activeLots: r.active_lots,
    customFields: r.custom_fields ?? undefined,
    source: (r.source as Material["source"]) ?? undefined,
    stockReportName: r.stock_report_name ?? undefined,
  };
}

function materialToRow(m: Material): MaterialRow {
  return {
    id: m.id,
    supplier: m.supplier,
    product: m.product,
    former_name: m.formerName,
    form: m.form,
    chemistry: m.chemistry,
    max_service_temp: m.maxServiceTemp,
    cure_temp: m.cureTemp,
    ooa_capable: m.ooaCapable,
    nasa_e595: m.nasaE595,
    notes: m.notes,
    available_qty: m.availableQty,
    available_unit: m.availableUnit,
    incoming_qty: m.incomingQty,
    incoming_eta: m.incomingEta,
    total_lots: m.totalLots,
    active_lots: m.activeLots,
    custom_fields: m.customFields ?? null,
    source: m.source ?? null,
    stock_report_name: m.stockReportName ?? null,
  };
}

async function hydrate(): Promise<void> {
  if (_hydrated) return;
  if (_hydrating) return _hydrating;
  _hydrating = (async () => {
    const [matRes, repRes] = await Promise.all([
      supabase.from("materials" as never).select("*").order("product"),
      supabase.from("stock_reports" as never).select("*").order("uploaded_at", { ascending: false }),
    ]);
    if (!matRes.error && Array.isArray(matRes.data)) {
      _store = {
        ..._store,
        materials: (matRes.data as unknown as MaterialRow[]).map(rowToMaterial),
      };
    }
    if (!repRes.error && Array.isArray(repRes.data)) {
      _store = {
        ..._store,
        stockReports: (repRes.data as unknown as StockReportRow[]).map((r) => ({
          fileName: r.file_name,
          uploadedAt: new Date(r.uploaded_at).toLocaleString(),
          rowCount: r.row_count,
          customColumns: r.custom_columns ?? [],
        })),
      };
    }
    _hydrated = true;
    notify();
  })();
  return _hydrating;
}

export function preloadMaterialStore(): Promise<void> {
  return hydrate();
}

// ─── Public mutations ───────────────────────────────────────────────

export function setMaterials(materials: Material[]) {
  _store = { ..._store, materials };
  notify();
}

export async function addMaterials(newMaterials: Material[], report: StockReportRecord) {
  // Ensure cache reflects DB before merging so fuzzy matching works correctly
  await hydrate();
  const existing = [..._store.materials];

  for (const incoming of newMaterials) {
    const matchIdx = existing.findIndex(
      (m) => fuzzyMatch(m.product, incoming.product) || fuzzyMatch(m.id, incoming.id),
    );
    if (matchIdx >= 0) {
      const merged = { ...existing[matchIdx] };
      if (incoming.formerName && !merged.formerName) merged.formerName = incoming.formerName;
      if (incoming.notes && !merged.notes) merged.notes = incoming.notes;
      if (incoming.maxServiceTemp && incoming.maxServiceTemp !== "—") merged.maxServiceTemp = incoming.maxServiceTemp;
      if (incoming.cureTemp && incoming.cureTemp !== "—") merged.cureTemp = incoming.cureTemp;
      if (incoming.ooaCapable) merged.ooaCapable = incoming.ooaCapable;
      if (incoming.nasaE595) merged.nasaE595 = incoming.nasaE595;
      if (incoming.customFields) {
        merged.customFields = { ...(merged.customFields || {}), ...incoming.customFields };
      }
      merged.source = "stock-report";
      merged.stockReportName = report.fileName;
      existing[matchIdx] = merged;
    } else {
      incoming.source = "stock-report";
      incoming.stockReportName = report.fileName;
      existing.push(incoming);
    }
  }

  // Persist all touched materials (upsert) and the stock report
  const rows = existing.map(materialToRow);
  const upsert = await supabase
    .from("materials" as never)
    .upsert(rows as never, { onConflict: "id" });
  if (upsert.error) {
    console.error("Failed to persist materials", upsert.error);
    throw upsert.error;
  }

  const repInsert = await supabase
    .from("stock_reports" as never)
    .insert({
      file_name: report.fileName,
      row_count: report.rowCount,
      custom_columns: report.customColumns,
    } as never);
  if (repInsert.error) console.error("Failed to persist stock report", repInsert.error);

  _store = {
    ..._store,
    materials: existing,
    stockReports: [report, ..._store.stockReports],
  };
  notify();
}

export async function clearAllData() {
  const [m, r] = await Promise.all([
    supabase.from("materials" as never).delete().not("id", "is", null),
    supabase.from("stock_reports" as never).delete().not("id", "is", null),
  ]);
  if (m.error) console.error("Failed to clear materials", m.error);
  if (r.error) console.error("Failed to clear stock reports", r.error);

  _store = { materials: [], lots: [], coaRecords: [], cocRecords: [], stockReports: [] };
  notify();
}

export function useMaterialStore(): MaterialStore {
  const [snapshot, setSnapshot] = useState<MaterialStore>(() => _store);
  useEffect(() => {
    const listener = () => setSnapshot({ ..._store });
    _listeners.add(listener);
    setSnapshot({ ..._store });
    void hydrate();
    return () => {
      _listeners.delete(listener);
    };
  }, []);
  return snapshot;
}

// ─── Fuzzy Matching ─────────────────────────────────────────────────
// Handles trademark symbols, registered marks, whitespace variations,
// and common naming patterns in aerospace composite products.

function normalize(str: string): string {
  return str
    .replace(/[®™©]/g, "")           // Remove trademark symbols
    .replace(/\s+/g, " ")             // Collapse whitespace
    .replace(/[–—]/g, "-")            // Normalize dashes
    .replace(/['']/g, "'")            // Normalize quotes
    .replace(/\s*\/\s*/g, "/")        // Normalize slashes
    .trim()
    .toLowerCase();
}

function tokenize(str: string): string[] {
  return normalize(str)
    .split(/[\s\-\/]+/)
    .filter((t) => t.length > 0);
}

export function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  
  const normA = normalize(a);
  const normB = normalize(b);
  
  // Exact match after normalization
  if (normA === normB) return true;
  
  // Full string containment — only if the shorter string is > 4 chars
  // This handles "FM® 300" vs "FM 300" but not "FM" matching everything
  const shorter_str = normA.length <= normB.length ? normA : normB;
  const longer_str = normA.length <= normB.length ? normB : normA;
  if (shorter_str.length > 4 && longer_str === shorter_str) return true;
  
  // Token-based matching: require ALL tokens from the shorter to appear EXACTLY in the longer
  // This prevents "FM 73" from matching "FM 57"
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  const shorterToks = tokA.length <= tokB.length ? tokA : tokB;
  const longerToks = tokA.length <= tokB.length ? tokB : tokA;
  
  if (shorterToks.length === 0) return false;
  
  // Require exact token matches only (no substring matching)
  const exactMatches = shorterToks.filter((t) => longerToks.some((l) => l === t));
  
  // All tokens from the shorter must match exactly in the longer
  // AND the token counts must be similar (within 1 token difference)
  if (exactMatches.length === shorterToks.length && Math.abs(tokA.length - tokB.length) <= 1) {
    return true;
  }
  
  return false;
}

// ─── Tooltip Definitions ────────────────────────────────────────────
// Centralized explanations for every status, color, and badge in the UI.

export const STATUS_TOOLTIPS = {
  // Lot statuses
  compliant: "This lot is within its freezer life and cumulative out-time limits. Safe to allocate and ship.",
  warning: "This lot is approaching its freezer life expiration (< 30 days remaining) or has consumed > 50% of its allowed out-time. Plan to use or ship soon.",
  critical: "This lot has < 7 days of freezer life remaining or > 80% out-time consumed. Immediate action required — allocate, ship, or quarantine.",
  expired: "This lot has exceeded its manufacturer shelf life or maximum cumulative out-time. It cannot be shipped to customers and must be quarantined for disposition.",
  
  // Commitment feasibility
  confirmed: "Sufficient compliant inventory is available and allocated. This order can ship on schedule.",
  "at-risk": "Inventory exists but may not meet compliance requirements by the due date (e.g., lot nearing expiration or out-time limit). Monitor closely.",
  blocked: "No compliant inventory is available to fulfill this order. Requires new stock receipt or customer communication.",
  fulfilled: "This order has been fully shipped with a COC package delivered to the customer. Tracking information is available.",
  
  // NASA E595
  "nasa-pass": "✓ Pass — This material has been tested and meets NASA ASTM E595 outgassing requirements (TML ≤ 1.0%, CVCM ≤ 0.1%). Approved for spacecraft and vacuum applications.",
  "nasa-verify": "▲ Verify — This material has grades or configurations that pass NASA E595, but compliance depends on the specific lot, cure schedule, or formulation. Verify against the COA for each lot.",
  "nasa-na": "N/A — NASA E595 testing has not been performed or is not applicable for this material type.",
  
  // OOA Capable
  "ooa-yes": "Yes — This material can be cured Out-of-Autoclave (OOA) using vacuum bag only (VBO) processing, typically at lower pressures (< 15 psi). Suitable for field repair and facilities without autoclave equipment.",
  "ooa-no": "No — This material requires autoclave cure at elevated pressure (typically 45–100 psi). Not suitable for vacuum-bag-only processing.",
  
  // Compliance badges
  "compliance-pass": "All monitored parameters (freezer temperature, cumulative out-time, shelf life) are within specification. No corrective action needed.",
  "compliance-warning": "One or more parameters are approaching their limits. Review and plan corrective action within the next shift.",
  "compliance-fail": "One or more parameters have exceeded their limits. Material may be non-conforming. Quarantine and initiate disposition review.",
  
  // Freezer life bar
  "freezer-life": "Freezer life is the remaining days until the material's manufacturer-specified shelf life expires, assuming continuous storage at the required temperature (typically -18°C ± 3°C).",
  
  // Out-time bar
  "out-time": "Out-time is the cumulative hours a material has spent outside its required storage temperature. Each material has a manufacturer-specified maximum (e.g., 168 hrs for AF 191, 72 hrs for EA 9673). Once exceeded, the material is non-conforming.",
  
  // Temperature
  "temp-normal": "Freezer temperature is within the required range (-18°C ± 3°C). Storage conditions are nominal.",
  "temp-warning": "Freezer temperature is approaching the upper limit of the acceptable range. Check refrigeration unit.",
  "temp-critical": "Freezer temperature has exceeded the acceptable range. Materials may be affected — log a defrost event and assess impact.",
  
  // Document types
  "doc-coa": "Certificate of Analysis — Issued by the material manufacturer. Contains test results (lap shear, peel strength, Tg, volatile content, etc.) proving the batch meets its specification.",
  "doc-coc": "Certificate of Conformance — Issued by Traceum (the distributor). Certifies the complete chain of custody from manufacturer receipt through storage to customer shipment, including temperature and out-time compliance.",
  "doc-mtc": "Material Test Certificate — Additional third-party or in-house test data beyond the manufacturer's COA. May include customer-specific qualification tests.",
  "doc-genealogy": "Material Genealogy Report — Full traceability document linking the material from raw material source through manufacturing, distribution, and final delivery.",
  
  // Shipment statuses
  "shipment-on-track": "Shipment is progressing normally and expected to arrive by the scheduled date.",
  "shipment-delayed": "Shipment has been delayed by the supplier. The new ETA has been updated. Check affected customer orders.",
  "shipment-arrived": "Shipment has arrived at the facility and is pending incoming inspection.",
  "shipment-inspecting": "Shipment is currently undergoing incoming inspection (visual check, COA verification, temperature log review).",
  
  // Incoming badge
  "incoming-qty": "Units currently in transit from the supplier. The ETA shown is the expected arrival date at your facility.",
  
  // Stock report badge
  "stock-report-badge": "SR — This product's data was enriched or added by a stock report upload. Custom columns from the report are shown at the end of the table.",
  
  // Custom column values
  "custom-check": "✓ — This material is approved/suitable for this application category based on the stock report data.",
  "custom-cross": "✗ — This material is not approved or not typically used for this application category.",
  "custom-dash": "— — No data available for this application category. The stock report did not include information for this product/column combination.",
} as const;

// ─── Seed Functions ─────────────────────────────────────────────────
// Loads realistic mock data into the store on first use.
// Only seeds if the store is currently empty (no materials).

export function seedMockData(seed: {
  materials: Material[];
  lots: MaterialLot[];
  coaRecords: COARecord[];
  cocRecords: COCRecord[];
  stockReport: StockReportRecord;
}) {
  if (_store.materials.length > 0) return; // Don't overwrite existing data
  _store = {
    materials: seed.materials,
    lots: seed.lots,
    coaRecords: seed.coaRecords,
    cocRecords: seed.cocRecords,
    stockReports: [seed.stockReport],
  };
  notify();
}

export function addLots(lots: MaterialLot[]) {
  _store = { ..._store, lots: [..._store.lots, ...lots] };
  notify();
}

export function addCOARecords(records: COARecord[]) {
  _store = { ..._store, coaRecords: [..._store.coaRecords, ...records] };
  notify();
}

export function addCOCRecords(records: COCRecord[]) {
  _store = { ..._store, cocRecords: [..._store.cocRecords, ...records] };
  notify();
}

// Color legend for the health bar
export const HEALTH_BAR_TOOLTIPS = {
  compliant: "Green — Compliant lots with > 30 days freezer life remaining and < 50% out-time consumed.",
  warning: "Amber — Lots with < 30 days freezer life remaining or > 50% out-time consumed. Needs attention.",
  critical: "Red — Lots with < 7 days freezer life remaining or > 80% out-time consumed. Urgent action required.",
  expired: "Grey — Lots that have exceeded shelf life or out-time limits. Cannot be shipped.",
} as const;

// Metric card tooltips
export const METRIC_TOOLTIPS = {
  activeLots: "Total number of material lots currently in inventory that are within their shelf life and have not been fully consumed or shipped.",
  unitsAvailable: "Total quantity of material units (rolls, kits, liters) currently in stock and available for allocation to customer orders.",
  unitsIncoming: "Total quantity of material units currently in transit from suppliers, based on open purchase orders with confirmed ship dates.",
  avgRemainingLife: "The average number of days of freezer life remaining across all active lots. A declining trend indicates aging inventory that may need expedited allocation.",
  ordersPending: "Number of customer orders that have been received but not yet fully shipped. Includes confirmed, at-risk, and blocked commitments.",
} as const;
