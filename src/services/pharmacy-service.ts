import { supabaseRest, supabaseRpc } from "../lib/supabase/client";
import type { DirectorySearchRow, LocationQuality, RepPharmacyRow } from "../lib/supabase/types";

export type PharmacyInput = {
  id?: string;
  directoryPharmacyId?: string;
  practiceNumber?: string;
  name: string;
  address?: string;
  suburb?: string;
  town?: string;
  province?: string;
  telephone?: string;
  lat?: number;
  lng?: number;
  locationQuality?: LocationQuality;
  grade: string;
  requiredVisitsOverride?: number;
  notes?: string;
  source?: string;
  active?: boolean;
};

export async function listRepPharmacies(repId: string, includeArchived = true) {
  const activeFilter = includeArchived ? "" : "&active=eq.true";
  return supabaseRest<RepPharmacyRow[]>(`rep_pharmacies?rep_id=eq.${encodeURIComponent(repId)}${activeFilter}&select=*&order=pharmacy_name.asc`);
}

export async function upsertRepPharmacies(repId: string, pharmacies: PharmacyInput[]) {
  if (!pharmacies.length) return [];
  const rows = pharmacies.map((pharmacy) => ({
    ...(pharmacy.id ? { id: pharmacy.id } : {}),
    rep_id: repId,
    directory_pharmacy_id: pharmacy.directoryPharmacyId ?? null,
    practice_number: pharmacy.practiceNumber ?? null,
    pharmacy_name: pharmacy.name,
    address: pharmacy.address ?? null,
    suburb: pharmacy.suburb ?? null,
    town: pharmacy.town ?? null,
    province: pharmacy.province ?? null,
    telephone: pharmacy.telephone ?? null,
    latitude: pharmacy.lat ?? null,
    longitude: pharmacy.lng ?? null,
    location_quality: pharmacy.locationQuality ?? (pharmacy.lat !== undefined && pharmacy.lng !== undefined ? "area_estimate" : "unresolved"),
    grade: pharmacy.grade || "C",
    required_visits_override: pharmacy.requiredVisitsOverride ?? null,
    notes: pharmacy.notes ?? null,
    active: pharmacy.active ?? true,
    source: pharmacy.source ?? "import",
  }));
  return supabaseRest<RepPharmacyRow[]>("rep_pharmacies?on_conflict=rep_id,practice_number&select=*", {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

export async function updateRepPharmacy(id: string, patch: Partial<PharmacyInput>) {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.pharmacy_name = patch.name;
  if (patch.address !== undefined) body.address = patch.address;
  if (patch.suburb !== undefined) body.suburb = patch.suburb;
  if (patch.town !== undefined) body.town = patch.town;
  if (patch.province !== undefined) body.province = patch.province;
  if (patch.telephone !== undefined) body.telephone = patch.telephone;
  if (patch.grade !== undefined) body.grade = patch.grade;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.active !== undefined) body.active = patch.active;
  if (patch.requiredVisitsOverride !== undefined) body.required_visits_override = patch.requiredVisitsOverride;
  if (patch.lat !== undefined) body.latitude = patch.lat;
  if (patch.lng !== undefined) body.longitude = patch.lng;
  if (patch.locationQuality !== undefined) body.location_quality = patch.locationQuality;
  const rows = await supabaseRest<RepPharmacyRow[]>(`rep_pharmacies?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    body,
    prefer: "return=representation",
  });
  return rows[0];
}

export async function searchDirectory(searchText: string) {
  if (searchText.trim().length < 3) return [];
  return supabaseRpc<DirectorySearchRow[]>("search_pharmacy_directory", { search_text: searchText.trim() });
}

export function rowToPharmacyInput(row: RepPharmacyRow): PharmacyInput {
  return {
    id: row.id,
    directoryPharmacyId: row.directory_pharmacy_id ?? undefined,
    practiceNumber: row.practice_number ?? undefined,
    name: row.pharmacy_name,
    address: row.address ?? undefined,
    suburb: row.suburb ?? undefined,
    town: row.town ?? undefined,
    province: row.province ?? undefined,
    telephone: row.telephone ?? undefined,
    lat: row.latitude ?? undefined,
    lng: row.longitude ?? undefined,
    locationQuality: row.location_quality,
    grade: row.grade,
    requiredVisitsOverride: row.required_visits_override ?? undefined,
    notes: row.notes ?? undefined,
    source: row.source,
    active: row.active,
  };
}
