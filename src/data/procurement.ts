/*
 * Traceum — Procurement Data Layer
 *
 * Backed by Supabase tables `procurement_requests`, `vendor_contacts`,
 * and `procurement_sends`. Mirrors the lightweight subscription pattern
 * used by masterSpecs.ts.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProcurementRequest {
  id: string;
  masterSpecId: string;
  engineerName: string;
  chosenVendor: string;
  quantity: string | null;
  note: string | null;
  status: "pending" | "sent" | "fulfilled" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface VendorContact {
  id: string;
  vendor: string;
  contactName: string | null;
  email: string;
  notes: string | null;
}

interface RequestRow {
  id: string;
  master_spec_id: string;
  engineer_name: string;
  chosen_vendor: string;
  quantity: string | null;
  note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  vendor: string;
  contact_name: string | null;
  email: string;
  notes: string | null;
}

function rowToReq(r: RequestRow): ProcurementRequest {
  return {
    id: r.id,
    masterSpecId: r.master_spec_id,
    engineerName: r.engineer_name,
    chosenVendor: r.chosen_vendor,
    quantity: r.quantity,
    note: r.note,
    status: (r.status as ProcurementRequest["status"]) ?? "pending",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToContact(r: ContactRow): VendorContact {
  return {
    id: r.id,
    vendor: r.vendor,
    contactName: r.contact_name,
    email: r.email,
    notes: r.notes,
  };
}

interface Store {
  requests: ProcurementRequest[];
  contacts: VendorContact[];
}

let _store: Store = { requests: [], contacts: [] };
const _listeners = new Set<() => void>();
let _hydrated = false;
let _hydrating: Promise<void> | null = null;

const notify = () => _listeners.forEach((fn) => fn());

async function hydrate() {
  if (_hydrated) return;
  if (_hydrating) return _hydrating;
  _hydrating = (async () => {
    try {
      const [r, c] = await Promise.all([
        supabase.from("procurement_requests" as never).select("*").order("created_at", { ascending: false }),
        supabase.from("vendor_contacts" as never).select("*").order("vendor"),
      ]);
      if (!r.error && Array.isArray(r.data)) {
        _store = { ..._store, requests: (r.data as unknown as RequestRow[]).map(rowToReq) };
      }
      if (!c.error && Array.isArray(c.data)) {
        _store = { ..._store, contacts: (c.data as unknown as ContactRow[]).map(rowToContact) };
      }
      _hydrated = true;
      notify();
    } finally {
      _hydrating = null;
    }
  })();
  return _hydrating;
}

async function refresh() {
  _hydrated = false;
  await hydrate();
}

export function useProcurementStore(): Store {
  const [snap, setSnap] = useState<Store>(() => _store);
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

export async function addProcurementRequest(input: {
  masterSpecId: string;
  engineerName: string;
  chosenVendor: string;
  quantity?: string;
  note?: string;
}) {
  await hydrate();
  const { error } = await supabase.from("procurement_requests" as never).insert({
    master_spec_id: input.masterSpecId,
    engineer_name: input.engineerName,
    chosen_vendor: input.chosenVendor,
    quantity: input.quantity ?? null,
    note: input.note ?? null,
  } as never);
  if (error) throw error;
  await refresh();
}

export async function updateProcurementRequest(
  id: string,
  patch: Partial<Pick<ProcurementRequest, "engineerName" | "chosenVendor" | "quantity" | "note" | "status">>,
) {
  const update: Record<string, unknown> = {};
  if (patch.engineerName !== undefined) update.engineer_name = patch.engineerName;
  if (patch.chosenVendor !== undefined) update.chosen_vendor = patch.chosenVendor;
  if (patch.quantity !== undefined) update.quantity = patch.quantity;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.status !== undefined) update.status = patch.status;
  const { error } = await supabase
    .from("procurement_requests" as never)
    .update(update as never)
    .eq("id", id);
  if (error) throw error;
  await refresh();
}

export async function deleteProcurementRequest(id: string) {
  const { error } = await supabase.from("procurement_requests" as never).delete().eq("id", id);
  if (error) throw error;
  await refresh();
}

export async function upsertVendorContact(input: {
  id?: string;
  vendor: string;
  contactName?: string;
  email: string;
  notes?: string;
}) {
  const row = {
    vendor: input.vendor,
    contact_name: input.contactName ?? null,
    email: input.email,
    notes: input.notes ?? null,
  };
  const { error } = await supabase
    .from("vendor_contacts" as never)
    .upsert(row as never, { onConflict: "vendor" });
  if (error) throw error;
  await refresh();
}

export async function deleteVendorContact(id: string) {
  const { error } = await supabase.from("vendor_contacts" as never).delete().eq("id", id);
  if (error) throw error;
  await refresh();
}

export async function logProcurementSend(input: {
  vendor: string;
  email: string;
  requestIds: string[];
  body: string;
}) {
  await supabase.from("procurement_sends" as never).insert({
    vendor: input.vendor,
    email: input.email,
    request_ids: input.requestIds,
    body: input.body,
  } as never);
}
