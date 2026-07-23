import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  FileUp,
  Gauge,
  MapPin,
  MoveRight,
  Play,
  Plus,
  Settings2,
  Table2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { ChangeEvent, Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseConfig, isDemoMode } from "./lib/supabase/config";
import type { AuthSession, DirectorySearchRow, ProfileRow, RepPharmacyRow } from "./lib/supabase/types";
import { clearStoredSession, currentSession, isExpiredAuthError, processAuthCallbackFromUrl, requestPasswordReset, resendSignUpConfirmation, signInWithPassword, signOut, signUpWithPassword } from "./services/auth-service";
import { deleteBlockedDateByDate, listBlockedDates, upsertBlockedDate } from "./services/availability-service";
import { confirmCsvImport } from "./services/import-service";
import { listNotifications } from "./services/notification-service";
import { loadLatestMonthlyPlan, saveMonthlyPlan } from "./services/planning-service";
import { getProfile } from "./services/profile-service";
import { addDirectoryPharmacyToMyList, archiveRepPharmacy, initializeDemoSalesRepWorkspace, listRepPharmacies, searchDirectory } from "./services/pharmacy-service";

type TabKey = "overview" | "pharmacies" | "monthly-plan" | "availability" | "team" | "settings";
type GradeRules = Record<string, number>;

type Account = {
  id: string;
  directoryPharmacyId?: string;
  practiceNumber?: string;
  name: string;
  address: string;
  area: string;
  town?: string;
  telephone?: string;
  grade: string;
  active?: boolean;
  lat?: number;
  lng?: number;
  coordinateSource?: string;
  coordinateConfidence?: string;
  coordinateMatch?: string;
  locationPrecision?: string;
  requiredVisitsOverride?: number;
};

type NonFieldDay = {
  date: string;
  reason: string;
  type: "Leave" | "Meeting" | "Training" | "Holiday" | "Travel" | "Sick";
};

type Visit = {
  id: string;
  accountId: string;
  date: string;
  locked?: boolean;
};

type PersistedState = {
  accounts: Account[];
  gradeRules: GradeRules;
  nonFieldDays: NonFieldDay[];
  visits: Visit[];
  month: string;
  dailyCapacity: number;
  minDailyCalls: number;
  cycleStartDay: number;
  routeStartAddress: string;
  routeStartLat?: number;
  routeStartLng?: number;
  managerNotice: string;
  managerTrainingDate: string;
  managerPlanningDueDays: number;
};

type ComplianceRow = {
  account: Account;
  required: number;
  planned: number;
  status: "Compliant" | "At risk" | "Missed";
};

type ImportResult = {
  accounts: Account[];
  warnings: string[];
};

type ImportNotice = {
  tone: "good" | "bad" | "warn";
  message: string;
};

type ToastType = "success" | "info" | "warning" | "error";

type ToastNotification = {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  createdAt: number;
  durationMs?: number | null;
  dedupeKey?: string;
  action?: { label: string; onClick: () => void };
};

type AuthMode = "sign-in" | "sign-up" | "forgot" | "check-email";
type AuthInitState = "idle" | "checking" | "ready" | "error";

type WorkspaceLoadState = "idle" | "loading" | "ready" | "error";

const STORAGE_KEY = "cpa-planner-state-v6";
const DEMO_LIST_URL = "/demo-list.csv";

const proximityRules = {
  preferredPairKm: 25,
  softDailyRadiusKm: 35,
  strongPenaltyKm: 50,
  hardPairKm: 75,
  unknownLocationPenalty: 140,
};

const toastDurations: Record<ToastType, number | null> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: null,
};

const defaultRules: GradeRules = {
  A: 2,
  B: 1,
  C: 0,
};

const areaCoordinates: Record<string, { lat: number; lng: number }> = {
  "AIRPORT INDUSTRIA": { lat: -33.9677, lng: 18.5915 },
  ATHLONE: { lat: -33.9648, lng: 18.5056 },
  BELHAR: { lat: -33.944, lng: 18.627 },
  BREDASDORP: { lat: -34.5322, lng: 20.0403 },
  CALEDON: { lat: -34.2291, lng: 19.4265 },
  "CAPE TOWN": { lat: -33.9249, lng: 18.4241 },
  CHARLESVILLE: { lat: -33.9448, lng: 18.5733 },
  DELFT: { lat: -33.9708, lng: 18.6425 },
  "EERSTE RIVER": { lat: -34.006, lng: 18.7339 },
  "ELSIES RIVER": { lat: -33.9334, lng: 18.5815 },
  FAURE: { lat: -34.0314, lng: 18.7602 },
  FORESHORE: { lat: -33.9167, lng: 18.4323 },
  GARDENS: { lat: -33.9355, lng: 18.4125 },
  GATESVILLE: { lat: -33.9657, lng: 18.5392 },
  "GORDON'S BAY": { lat: -34.1556, lng: 18.8662 },
  "GRASSY PARK": { lat: -34.0494, lng: 18.502 },
  "GREEN POINT": { lat: -33.9069, lng: 18.4075 },
  GUGULETU: { lat: -33.9838, lng: 18.5662 },
  HELDERBERG: { lat: -34.0757, lng: 18.8433 },
  HERMANUS: { lat: -34.4187, lng: 19.2345 },
  KENILWORTH: { lat: -33.9941, lng: 18.4715 },
  KHAYELITSHA: { lat: -34.0393, lng: 18.6792 },
  LANSDOWNE: { lat: -33.9877, lng: 18.497 },
  LENTEGEUR: { lat: -34.037, lng: 18.616 },
  MACASSAR: { lat: -34.0605, lng: 18.7567 },
  MAITLAND: { lat: -33.9208, lng: 18.4897 },
  MAKHAZA: { lat: -34.0465, lng: 18.6691 },
  MFULENI: { lat: -34.0015, lng: 18.6824 },
  "MITCHELLS PLAIN": { lat: -34.0488, lng: 18.6173 },
  MUIZENBERG: { lat: -34.1082, lng: 18.468 },
  OBSERVATORY: { lat: -33.9366, lng: 18.4695 },
  OTTERY: { lat: -34.0151, lng: 18.5061 },
  "PELICAN PARK": { lat: -34.0754, lng: 18.5119 },
  PHILIPPI: { lat: -34.0099, lng: 18.5477 },
  PINELANDS: { lat: -33.931, lng: 18.5121 },
  PLUMSTEAD: { lat: -34.0193, lng: 18.4721 },
  RONDEBOSCH: { lat: -33.9637, lng: 18.4764 },
  SANDBAAI: { lat: -34.4219, lng: 19.1932 },
  "SEA POINT": { lat: -33.918, lng: 18.3895 },
  "SIMON'S TOWN": { lat: -34.1937, lng: 18.4357 },
  "SOMERSET WEST": { lat: -34.0757, lng: 18.8433 },
  STRAND: { lat: -34.1069, lng: 18.8275 },
  "SUN VALLEY": { lat: -34.1269, lng: 18.3994 },
  SWELLENDAM: { lat: -34.0226, lng: 20.4417 },
  TOKAI: { lat: -34.0617, lng: 18.4383 },
  WATERFRONT: { lat: -33.9031, lng: 18.4217 },
};

function getInitialMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function loadState(): PersistedState {
  const fallback = {
    accounts: [] as Account[],
    gradeRules: defaultRules,
    nonFieldDays: [
      { date: `${getInitialMonth()}-12`, reason: "Regional sales meeting", type: "Meeting" as const },
      { date: `${getInitialMonth()}-19`, reason: "Product training", type: "Training" as const },
    ],
    visits: [] as Visit[],
    month: getInitialMonth(),
    dailyCapacity: 8,
    minDailyCalls: 4,
    cycleStartDay: 1,
    routeStartAddress: "",
    routeStartLat: undefined,
    routeStartLng: undefined,
    managerNotice: "",
    managerTrainingDate: `${getInitialMonth()}-18`,
    managerPlanningDueDays: 7,
  };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function accountFromPharmacyRow(row: RepPharmacyRow): Account {
  const area = row.suburb ?? row.town ?? "Unassigned";
  return {
    id: row.id,
    directoryPharmacyId: row.directory_pharmacy_id ?? undefined,
    practiceNumber: row.practice_number ?? undefined,
    name: row.pharmacy_name,
    address: row.address ?? [row.suburb, row.town, row.province].filter(Boolean).join(", "),
    area,
    town: row.town ?? undefined,
    telephone: row.telephone ?? undefined,
    grade: row.grade,
    active: row.active,
    lat: row.latitude ?? undefined,
    lng: row.longitude ?? undefined,
    coordinateSource: row.source,
    coordinateConfidence: row.location_quality === "suburb" || row.location_quality === "area_estimate" ? "Approximate town location" : row.location_quality === "unresolved" ? "Needs review" : "Located",
    coordinateMatch: row.directory_pharmacy_id ? "Directory match" : "Representative record",
    locationPrecision: row.location_quality === "suburb" || row.location_quality === "area_estimate" ? "town" : row.location_quality,
  };
}

function defaultStateForMonth(): PersistedState {
  return {
    accounts: [],
    gradeRules: defaultRules,
    nonFieldDays: [],
    visits: [],
    month: getInitialMonth(),
    dailyCapacity: 8,
    minDailyCalls: 4,
    cycleStartDay: 1,
    routeStartAddress: "",
    routeStartLat: undefined,
    routeStartLng: undefined,
    managerNotice: "",
    managerTrainingDate: `${getInitialMonth()}-18`,
    managerPlanningDueDays: 7,
  };
}

function stateFromSupabase(defaults: PersistedState, pharmacyRows: RepPharmacyRow[], blockedRows: Array<{ date: string; reason: string; type: string }>): PersistedState {
  return {
    ...defaults,
    accounts: pharmacyRows.map(accountFromPharmacyRow),
    nonFieldDays: blockedRows.map((day) => ({
      date: day.date,
      reason: day.reason,
      type: fromBlockedType(day.type),
    })),
  };
}

function fromBlockedType(value: string): NonFieldDay["type"] {
  const map: Record<string, NonFieldDay["type"]> = {
    training: "Training",
    meeting: "Meeting",
    leave: "Leave",
    conference: "Travel",
    public_holiday: "Holiday",
    other: "Travel",
  };
  return map[value] ?? "Travel";
}

function toBlockedType(value: NonFieldDay["type"]) {
  const map: Record<NonFieldDay["type"], "training" | "meeting" | "leave" | "conference" | "public_holiday" | "other"> = {
    Training: "training",
    Meeting: "meeting",
    Leave: "leave",
    Holiday: "public_holiday",
    Travel: "conference",
    Sick: "other",
  };
  return map[value];
}

function occurrenceNumberFromVisit(visit: Visit) {
  const match = visit.id.match(/-(\d+)-\d{4}-\d{2}-\d{2}$/);
  return match ? Number(match[1]) : 1;
}

function pharmacyInputFromAccount(account: Account) {
  return {
    id: account.id.startsWith("csv-") || account.id.startsWith("ACT") || account.id.startsWith("O") ? undefined : account.id,
    directoryPharmacyId: account.directoryPharmacyId,
    practiceNumber: account.practiceNumber ?? (account.id.startsWith("csv-") ? undefined : account.id),
    name: account.name,
    address: account.address,
    suburb: account.area,
    town: account.town,
    province: "WESTERN CAPE",
    telephone: account.telephone,
    lat: account.lat,
    lng: account.lng,
    locationQuality: account.lat !== undefined && account.lng !== undefined ? "area_estimate" as const : "unresolved" as const,
    grade: account.grade,
    requiredVisitsOverride: account.requiredVisitsOverride,
    source: "import",
    active: true,
  };
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayKey() {
  return dateKey(new Date());
}

function daysInCalendarMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const days: string[] = [];
  const cursor = new Date(year, monthIndex - 1, 1);
  while (cursor.getMonth() === monthIndex - 1) {
    days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function daysInMonth(month: string, cycleStartDay = 1) {
  const [year, monthIndex] = month.split("-").map(Number);
  const startDay = Math.min(Math.max(1, Math.floor(cycleStartDay || 1)), 28);
  if (startDay === 1) return daysInCalendarMonth(month);
  const days: string[] = [];
  const cursor = new Date(year, monthIndex - 1, startDay);
  const end = new Date(year, monthIndex, startDay);
  while (cursor < end) {
    days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function isWeekend(day: string) {
  const weekday = new Date(`${day}T12:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

function fieldDays(month: string, nonFieldDays: NonFieldDay[], cycleStartDay = 1) {
  const blocked = new Set(nonFieldDays.map((day) => day.date));
  return daysInMonth(month, cycleStartDay).filter((day) => !isWeekend(day) && !blocked.has(day));
}

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function blockedLabel(day: string, nonFieldDays: NonFieldDay[]) {
  if (isWeekend(day)) return "Weekend";
  const blocked = nonFieldDays.find((item) => item.date === day);
  return blocked ? blocked.reason || `${blocked.type} day` : "";
}

function gradeSortValue(grade: string) {
  return grade.charCodeAt(0) || 99;
}

function areaBucket(account: Account) {
  if (account.lat === undefined || account.lng === undefined) return account.area;
  const lat = Math.round(account.lat * 35) / 35;
  const lng = Math.round(account.lng * 35) / 35;
  return `${lat}:${lng}`;
}

function normalizeArea(value: string) {
  return value.trim().toUpperCase();
}

function enrichLocation(account: Account) {
  const known = areaCoordinates[normalizeArea(account.area)];
  if ((account.lat !== undefined && account.lng !== undefined) || !known) return account;
  return {
    ...account,
    lat: known.lat,
    lng: known.lng,
    coordinateSource: account.coordinateSource ?? "Area estimate",
    coordinateConfidence: account.coordinateConfidence ?? "Area-level",
    coordinateMatch: account.coordinateMatch ?? `${account.area} centroid`,
  };
}

function validCoordinate(point?: { lat?: number; lng?: number }) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng) && Math.abs(point!.lat!) <= 90 && Math.abs(point!.lng!) <= 180;
}

function calculateDistanceKm(a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }) {
  if (!validCoordinate(a) || !validCoordinate(b)) return null;
  const earthRadius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b!.lat! - a!.lat!);
  const dLng = toRad(b!.lng! - a!.lng!);
  const lat1 = toRad(a!.lat!);
  const lat2 = toRad(b!.lat!);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceKm(a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }) {
  return calculateDistanceKm(a, b) ?? proximityRules.unknownLocationPenalty;
}

function locationKey(account: Account) {
  return normalizeArea(account.area || account.town || account.address || "Unknown");
}

function locationConfidence(account: Account) {
  if (!validCoordinate(account)) return "unknown";
  if (account.locationPrecision === "exact" || account.coordinateConfidence === "Located") return "exact";
  if (account.locationPrecision === "town" || account.coordinateConfidence?.toLowerCase().includes("approximate") || account.coordinateConfidence === "Area-level") return "approximate";
  return "approximate";
}

function daySpanKm(items: Array<{ account: Account }>) {
  let span = 0;
  for (let index = 0; index < items.length; index += 1) {
    for (let other = index + 1; other < items.length; other += 1) {
      const distance = calculateDistanceKm(items[index].account, items[other].account);
      if (distance !== null) span = Math.max(span, distance);
    }
  }
  return span;
}

function routeRegion(area: string) {
  const normalized = normalizeArea(area);
  if (["WATERFRONT", "GREEN POINT", "SEA POINT", "CAPE TOWN", "FORESHORE", "GARDENS"].includes(normalized)) return "Cape Town CBD";
  if (["OBSERVATORY", "MAITLAND", "PINELANDS", "RONDEBOSCH", "KENILWORTH", "LANSDOWNE", "ATHLONE", "GATESVILLE"].includes(normalized)) return "Inner Southern Suburbs";
  if (["PLUMSTEAD", "OTTERY", "TOKAI", "MUIZENBERG", "SUN VALLEY", "SIMON'S TOWN", "GRASSY PARK", "PELICAN PARK"].includes(normalized)) return "Southern Peninsula";
  if (["AIRPORT INDUSTRIA", "CHARLESVILLE", "ELSIES RIVER", "BELHAR", "DELFT", "GUGULETU", "PHILIPPI", "MITCHELLS PLAIN", "LENTEGEUR", "MAKHAZA", "KHAYELITSHA", "MFULENI"].includes(normalized)) return "Cape Flats";
  if (["EERSTE RIVER", "FAURE", "MACASSAR", "SOMERSET WEST", "HELDERBERG", "STRAND", "GORDON'S BAY"].includes(normalized)) return "Helderberg";
  if (["HERMANUS", "SANDBAAI", "CALEDON", "BREDASDORP", "SWELLENDAM"].includes(normalized)) return "Overberg";
  return area || "Other";
}

function orderRouteItems(items: RouteItemForPlan[], startPoint?: { lat?: number; lng?: number }) {
  const remaining = items.slice().sort((a, b) => a.account.id.localeCompare(b.account.id));
  const ordered: RouteItemForPlan[] = [];
  let currentPoint = validCoordinate(startPoint)
    ? startPoint
    : remaining
      .filter((item) => validCoordinate(item.account))
      .slice()
      .sort((a, b) => a.account.lat! - b.account.lat! || a.account.lng! - b.account.lng! || a.account.id.localeCompare(b.account.id))[0]?.account;

  while (remaining.length) {
    const nextIndex = remaining
      .map((item, index) => ({ item, index, distance: distanceKm(currentPoint, item.account) }))
      .sort((a, b) => a.distance - b.distance || a.item.account.area.localeCompare(b.item.account.area) || a.item.account.name.localeCompare(b.item.account.name) || a.item.account.id.localeCompare(b.item.account.id))[0].index;
    const [next] = remaining.splice(nextIndex, 1);
    ordered.push(next);
    if (validCoordinate(next.account)) currentPoint = next.account;
  }

  return ordered;
}

type RouteItemForPlan = {
  account: Account;
  sequence: number;
  required: number;
  locationKey: string;
  confidence: "exact" | "approximate" | "unknown";
};

function generatePlan(accounts: Account[], rules: GradeRules, month: string, nonFieldDays: NonFieldDay[], capacity: number, minDailyCalls: number, cycleStartDay: number, startPoint?: { lat?: number; lng?: number }) {
  const availableDays = fieldDays(month, nonFieldDays, cycleStartDay);
  const dailyCap = Math.max(1, Math.floor(capacity || 1));
  const dailyMin = Math.max(0, Math.min(dailyCap, Math.floor(minDailyCalls || 0)));
  const generated: Visit[] = [];
  if (availableDays.length === 0) return generated;

  const sourceAccounts = accounts
    .filter((account) => account.active !== false)
    .map(enrichLocation)
    .sort((a, b) => locationKey(a).localeCompare(locationKey(b)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const itemsByRound = new Map<number, RouteItemForPlan[]>();
  sourceAccounts.forEach((account) => {
    const required = Math.max(0, Number(account.requiredVisitsOverride ?? rules[account.grade] ?? 0));
    for (let sequence = 1; sequence <= required; sequence += 1) {
      const items = itemsByRound.get(sequence) ?? [];
      items.push({ account, sequence, required, locationKey: locationKey(account), confidence: locationConfidence(account) });
      itemsByRound.set(sequence, items);
    }
  });

  type DayRoute = {
    day: string;
    items: RouteItemForPlan[];
    accountIds: Set<string>;
    locationKeys: Set<string>;
    centroid?: { lat: number; lng: number };
  };

  const dayRoutes: DayRoute[] = availableDays.map((day) => ({ day, items: [], accountIds: new Set(), locationKeys: new Set() }));
  const visitsByAccount = new Map<string, string[]>();
  const distanceCache = new Map<string, number | null>();
  const requiredVisits = Array.from(itemsByRound.values()).reduce((sum, items) => sum + items.length, 0);
  const infeasibleMonth = requiredVisits > availableDays.length * dailyCap;

  function dayIndex(day: string) {
    return availableDays.indexOf(day);
  }

  function cachedDistance(a: Account | { id?: string; lat?: number; lng?: number } | undefined, b: Account | { id?: string; lat?: number; lng?: number } | undefined) {
    const aKey = a?.id ?? `${a?.lat ?? "na"}:${a?.lng ?? "na"}`;
    const bKey = b?.id ?? `${b?.lat ?? "na"}:${b?.lng ?? "na"}`;
    const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    if (!distanceCache.has(key)) distanceCache.set(key, calculateDistanceKm(a, b));
    return distanceCache.get(key)!;
  }

  function minimumGap(item: RouteItemForPlan) {
    return Math.max(1, Math.floor(availableDays.length / Math.max(item.required, 1)) - 1);
  }

  function routeSpanIfAdded(route: DayRoute, item: RouteItemForPlan) {
    let span = 0;
    route.items.forEach((existing) => {
      const distance = cachedDistance(existing.account, item.account);
      if (distance !== null) span = Math.max(span, distance);
    });
    return span;
  }

  function updateCentroid(route: DayRoute) {
    const positioned = route.items.filter((item) => validCoordinate(item.account));
    if (!positioned.length) {
      route.centroid = undefined;
      return;
    }
    route.centroid = {
      lat: positioned.reduce((sum, item) => sum + item.account.lat!, 0) / positioned.length,
      lng: positioned.reduce((sum, item) => sum + item.account.lng!, 0) / positioned.length,
    };
  }

  function spacingPenalty(route: DayRoute, item: RouteItemForPlan) {
    const existing = visitsByAccount.get(item.account.id) ?? [];
    if (!existing.length) return 0;
    const closestGap = Math.min(...existing.map((day) => Math.abs(dayIndex(route.day) - dayIndex(day))));
    return Math.max(0, minimumGap(item) - closestGap) * 80;
  }

  function scoreRoute(route: DayRoute, item: RouteItemForPlan, strictDistance: boolean) {
    const projectedLoad = route.items.length + 1;
    const overload = Math.max(0, projectedLoad - dailyCap);
    if (!infeasibleMonth && overload > 0) return Number.POSITIVE_INFINITY;
    if (route.accountIds.has(item.account.id)) return Number.POSITIVE_INFINITY;

    const centroidDistance = route.items.length ? distanceKm(route.centroid, item.account) : distanceKm(startPoint, item.account) * 0.25;
    const maxPairDistance = routeSpanIfAdded(route, item);
    const sameKnownArea = route.locationKeys.has(item.locationKey);
    const hasUnknownLocation = item.confidence === "unknown" || route.items.some((existing) => existing.confidence === "unknown");
    const differentUnknownArea = hasUnknownLocation && route.items.length > 0 && !sameKnownArea;
    const approximatePenalty = item.confidence === "approximate" ? 8 : item.confidence === "unknown" ? proximityRules.unknownLocationPenalty : 0;

    if (strictDistance && route.items.length > 0) {
      if (differentUnknownArea) return Number.POSITIVE_INFINITY;
      if (maxPairDistance > proximityRules.hardPairKm && !sameKnownArea) return Number.POSITIVE_INFINITY;
    }

    const radiusPenalty = maxPairDistance > proximityRules.hardPairKm
      ? 6000 + (maxPairDistance - proximityRules.hardPairKm) * 150
      : maxPairDistance > proximityRules.strongPenaltyKm
        ? 1200 + (maxPairDistance - proximityRules.strongPenaltyKm) * 45
        : maxPairDistance > proximityRules.softDailyRadiusKm
          ? 260 + (maxPairDistance - proximityRules.softDailyRadiusKm) * 16
          : maxPairDistance > proximityRules.preferredPairKm
            ? (maxPairDistance - proximityRules.preferredPairKm) * 5
            : 0;
    const fillBonus = route.items.length > 0 && route.items.length < dailyMin && maxPairDistance <= proximityRules.softDailyRadiusKm ? -18 : 0;
    const areaBonus = sameKnownArea ? -60 : 0;
    const loadPenalty = route.items.length >= dailyMin ? route.items.length * 8 : route.items.length * 2;

    return overload * 1000 + centroidDistance * 7 + radiusPenalty + spacingPenalty(route, item) + approximatePenalty + loadPenalty + fillBonus + areaBonus;
  }

  function placeItem(item: RouteItemForPlan) {
    const route = [true, false]
      .flatMap((strict) => dayRoutes.map((dayRoute) => ({ route: dayRoute, score: scoreRoute(dayRoute, item, strict), strict })))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((a, b) => a.score - b.score || a.route.items.length - b.route.items.length || a.route.day.localeCompare(b.route.day))[0]?.route;
    if (!route) return;
    route.items.push(item);
    route.accountIds.add(item.account.id);
    route.locationKeys.add(item.locationKey);
    updateCentroid(route);
    const dates = visitsByAccount.get(item.account.id) ?? [];
    dates.push(route.day);
    visitsByAccount.set(item.account.id, dates);
  }

  Array.from(itemsByRound.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([, items]) => {
      const seededItems = items.slice().sort((a, b) => {
        const aFromStart = distanceKm(startPoint, a.account);
        const bFromStart = distanceKm(startPoint, b.account);
        return bFromStart - aFromStart || a.locationKey.localeCompare(b.locationKey) || a.account.name.localeCompare(b.account.name) || a.account.id.localeCompare(b.account.id);
      });
      seededItems.forEach(placeItem);
    });

  dayRoutes.forEach((route) => {
    orderRouteItems(route.items, startPoint).forEach((item) => {
      generated.push({ id: `${item.account.id}-${item.sequence}-${route.day}`, accountId: item.account.id, date: route.day });
    });
  });

  return generated;
}

function detectDelimiter(line: string) {
  return [",", ";", "\t"]
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells.map((value) => value.replace(/^\uFEFF/, ""));
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseImportRows(rows: string[][]): ImportResult {
  const cleanedRows = rows
    .map((row) => row.map((cell) => String(cell ?? "").trim().replace(/^\uFEFF/, "")))
    .filter((row) => row.some(Boolean));
  if (cleanedRows.length < 2) return { accounts: [], warnings: ["The file needs a header row and at least one pharmacy row."] };

  const headers = cleanedRows[0].map(normalizeHeader);
  const find = (...names: string[]) => {
    const normalizedNames = names.map(normalizeHeader);
    return normalizedNames.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  };
  const nameIndex = find("account name", "pharmacy name", "name", "account", "customer", "customer name", "practice", "practice name", "doctor", "hcp", "client");
  const addressIndex = find("address", "street", "physical address", "location");
  const areaIndex = find("suburb name", "brick name", "area", "suburb", "territory", "region");
  const townIndex = find("town city", "town", "city");
  const provinceIndex = find("province");
  const telephoneIndex = find("telephone", "phone", "phone number", "tel", "contact number");
  const gradeIndex = find("current grading", "grade", "class", "tier", "segment", "priority", "category", "previous grading");
  const codeIndex = find("practice number", "customer code", "account code", "code", "practice no");
  const requiredIndex = find("required visits", "monthly visits", "required monthly visits", "visits");
  const latIndex = find("lat", "latitude");
  const lngIndex = find("lng", "lon", "long", "longitude");
  const coordinateSourceIndex = find("coordinate source", "location source", "geocode source");
  const coordinateConfidenceIndex = find("coordinate confidence", "location confidence", "location quality", "geocode confidence", "confidence");
  const coordinateMatchIndex = find("coordinate match", "matched address", "geocode match", "match");

  const warnings: string[] = [];
  if (nameIndex < 0) return { accounts: [], warnings: ["No pharmacy name column was found. Use a heading like Pharmacy Name, Practice Name, Account Name or Name."] };
  if (gradeIndex < 0) warnings.push("No grade column was found. Imported pharmacies were defaulted to Grade C.");
  if (areaIndex < 0 && townIndex < 0) warnings.push("No town or suburb column was found. Imported pharmacies were grouped as Unassigned.");

  const seen = new Set<string>();
  let duplicateRows = 0;
  const accounts = cleanedRows.slice(1).flatMap((row, index) => {
    const name = row[nameIndex];
    const practiceNumber = row[codeIndex] || undefined;
    const grade = (row[gradeIndex] || "C").toUpperCase().slice(0, 1);
    if (!name || !grade) return [];
    const key = (practiceNumber || normalizeHeader(name + row[addressIndex])).toLowerCase();
    if (seen.has(key)) {
      duplicateRows += 1;
      return [];
    }
    seen.add(key);
    const lat = Number(row[latIndex]);
    const lng = Number(row[lngIndex]);
    const area = row[areaIndex] || row[townIndex] || "Unassigned";
    const requiredVisits = Number(row[requiredIndex]);
    return enrichLocation({
      id: practiceNumber || `import-${Date.now()}-${index}`,
      practiceNumber,
      name,
      address: row[addressIndex] || [row[areaIndex], row[townIndex], row[provinceIndex]].filter(Boolean).join(", "),
      area,
      town: row[townIndex] || undefined,
      telephone: row[telephoneIndex] || undefined,
      grade,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      coordinateSource: row[coordinateSourceIndex] || undefined,
      coordinateConfidence: row[coordinateConfidenceIndex] || undefined,
      coordinateMatch: row[coordinateMatchIndex] || undefined,
      locationPrecision: Number.isFinite(lat) && Number.isFinite(lng) ? "exact" : undefined,
      ...(Number.isFinite(requiredVisits) ? { requiredVisitsOverride: requiredVisits } : {}),
    } as Account);
  });

  if (duplicateRows > 0) warnings.push(`${duplicateRows} duplicate rows in the file were skipped.`);
  if (accounts.length === 0) warnings.push("No usable pharmacy rows were found after reading the file.");
  return { accounts, warnings };
}

function parseCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (lines.length < 2) return { accounts: [], warnings: ["The file needs a header row and at least one pharmacy row."] };
  const delimiter = detectDelimiter(lines[0]);
  return parseImportRows(lines.map((row) => parseCsvLine(row, delimiter)));
}

async function parseImportFile(file: File): Promise<ImportResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["csv", "txt", "xlsx", "xls"].includes(extension)) {
    return { accounts: [], warnings: ["Choose a CSV or Excel pharmacy file."] };
  }
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!worksheet) return { accounts: [], warnings: ["The workbook does not contain a readable sheet."] };
  const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, blankrows: false, raw: false, defval: "" });
  const result = parseImportRows(rows);
  if (workbook.SheetNames.length > 1) result.warnings.unshift(`Imported the first worksheet, ${sheetName}.`);
  return result;
}

function exportCsv(visits: Visit[], accounts: Account[]) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const lines = ["date,account,grade,area,address,latitude,longitude,coordinate_source,coordinate_confidence,coordinate_match"];
  visits
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((visit) => {
      const account = byId.get(visit.accountId);
      if (!account) return;
      lines.push([
        visit.date,
        account.name,
        account.grade,
        account.area,
        account.address,
        account.lat ?? "",
        account.lng ?? "",
        account.coordinateSource ?? "",
        account.coordinateConfidence ?? "",
        account.coordinateMatch ?? "",
      ].map((value) => `"${value}"`).join(","));
    });

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cpa-call-plan.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportCalendarCsv(visits: Visit[], accounts: Account[], days: string[], nonFieldDays: NonFieldDay[]) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const visitsByDate = new Map<string, Visit[]>();
  visits.forEach((visit) => {
    const dayVisits = visitsByDate.get(visit.date) ?? [];
    dayVisits.push(visit);
    visitsByDate.set(visit.date, dayVisits);
  });

  const lines = ["date,weekday,field_status,total_calls,areas,call_plan"];
  days.forEach((day) => {
    const dayVisits = visitsByDate.get(day) ?? [];
    const accountsForDay = dayVisits.map((visit) => byId.get(visit.accountId)).filter((account): account is Account => Boolean(account));
    const areas = Array.from(new Set(accountsForDay.map((account) => account.area))).join(" | ");
    const plan = accountsForDay.map((account, index) => `${index + 1}. ${account.name} (${account.area}, Grade ${account.grade})`).join(" | ");
    const weekday = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
    const status = blockedLabel(day, nonFieldDays) || "Field day";
    lines.push([day, weekday, status, String(dayVisits.length), areas, plan].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cpa-calendar-plan.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const supabaseConfig = getSupabaseConfig();
  const demoMode = isDemoMode();
  const [state, setState] = useState<PersistedState>(() => (supabaseConfig.configured ? defaultStateForMonth() : loadState()));
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [swapTargetDay, setSwapTargetDay] = useState<string>("");
  const [newNonField, setNewNonField] = useState({ date: `${state.month}-15`, type: "Leave" as NonFieldDay["type"], reason: "" });
  const [session, setSession] = useState<AuthSession | null>(() => (supabaseConfig.configured ? currentSession() : null));
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceLoadState>(supabaseConfig.configured && session ? "loading" : "idle");
  const [workspaceError, setWorkspaceError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authForm, setAuthForm] = useState({ email: "", password: "", fullName: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInitState, setAuthInitState] = useState<AuthInitState>(supabaseConfig.configured ? "checking" : "ready");
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; read_at: string | null }>>([]);
  const [allowLocalPrototype, setAllowLocalPrototype] = useState(false);
  const [pharmacySearch, setPharmacySearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryResults, setDirectoryResults] = useState<DirectorySearchRow[]>([]);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingMonthlyPlan, setIsLoadingMonthlyPlan] = useState(false);
  const [monthlyPlanError, setMonthlyPlanError] = useState("");
  const [selectedDirectoryIds, setSelectedDirectoryIds] = useState<string[]>([]);
  const workspaceRequestId = useRef(0);


  function dismissNotification(id: string) {
    setToastNotifications((current) => current.filter((notification) => notification.id !== id));
  }

  function notify(notification: Omit<ToastNotification, "id" | "createdAt" | "durationMs"> & { durationMs?: number | null }) {
    const createdAt = Date.now();
    setToastNotifications((current) => {
      const withoutDuplicate = notification.dedupeKey ? current.filter((item) => item.dedupeKey !== notification.dedupeKey) : current;
      return [{ ...notification, id: `${createdAt}-${Math.random().toString(16).slice(2)}`, createdAt, durationMs: notification.durationMs ?? toastDurations[notification.type] }, ...withoutDuplicate].slice(0, 3);
    });
  }

  function setImportNotice(notice: ImportNotice | null) {
    if (!notice) return;
    notify({
      type: notice.tone === "good" ? "success" : notice.tone === "bad" ? "error" : "warning",
      message: notice.message,
      dedupeKey: notice.message,
    });
  }

  useEffect(() => {
    if (!supabaseConfig.configured) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, supabaseConfig.configured]);

  useEffect(() => {
    setToastNotifications([]);
  }, [session?.user.id, state.month]);

  useEffect(() => {
    return () => {
      workspaceRequestId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfig.configured) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setAuthError("Authentication is taking longer than expected. Please try again.");
      setAuthInitState("error");
    }, 10000);

    processAuthCallbackFromUrl()
      .then((result) => {
        if (!active) return;
        window.clearTimeout(timeout);
        if (result.status === "authenticated") {
          setSession(result.session);
          setAuthMode("sign-in");
          setAuthError("");
          setAuthInitState("ready");
          return;
        }
        if (result.status === "error") {
          setSession(null);
          setAuthError(result.message);
          setAuthInitState("error");
          return;
        }
        setAuthInitState("ready");
      })
      .catch((error) => {
        if (!active) return;
        window.clearTimeout(timeout);
        setSession(null);
        setAuthError(error instanceof Error ? error.message : "Could not initialise authentication.");
        setAuthInitState("error");
      });

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [supabaseConfig.configured]);

  useEffect(() => {
    if (!supabaseConfig.configured && state.accounts.length === 0) loadDemoList("silent");
  }, [state.accounts.length, supabaseConfig.configured]);


  useEffect(() => {
    if (!directoryOpen || !supabaseConfig.configured) return;
    const query = directoryQuery.trim();
    setDirectoryError("");
    setSelectedDirectoryIds([]);
    if (query.length < 2) {
      setDirectoryResults([]);
      setDirectoryBusy(false);
      return;
    }
    setDirectoryBusy(true);
    const timer = window.setTimeout(() => {
      searchDirectory(query, 25)
        .then(setDirectoryResults)
        .catch(() => {
          setDirectoryResults([]);
          setDirectoryError("We couldn’t load the pharmacy directory. Please try again.");
        })
        .finally(() => setDirectoryBusy(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [directoryOpen, directoryQuery, supabaseConfig.configured]);

  useEffect(() => {
    if (!supabaseConfig.configured || authInitState !== "ready" || !session?.user.id) return;
    const mode = workspaceStatus === "ready" ? "month" : "initial";
    loadWorkspace(session, state.month, mode);
  }, [authInitState, session?.user.id, state.month, supabaseConfig.configured]);

  useEffect(() => {
    const cycleDays = daysInMonth(state.month, state.cycleStartDay);
    const today = todayKey();
    if (!selectedDay || !cycleDays.includes(selectedDay)) {
      setSelectedDay(cycleDays.includes(today) ? today : fieldDays(state.month, state.nonFieldDays, state.cycleStartDay)[0] ?? cycleDays[0]);
    }
  }, [selectedDay, state.month, state.nonFieldDays, state.cycleStartDay]);

  const accountById = useMemo(() => new Map(state.accounts.map((account) => [account.id, account])), [state.accounts]);
  const availableDays = useMemo(() => fieldDays(state.month, state.nonFieldDays, state.cycleStartDay), [state.month, state.nonFieldDays, state.cycleStartDay]);
  const allDays = useMemo(() => daysInMonth(state.month, state.cycleStartDay), [state.month, state.cycleStartDay]);
  const visitsByDay = useMemo(() => {
    const map = new Map<string, Visit[]>();
    state.visits.forEach((visit) => {
      const dayVisits = map.get(visit.date) ?? [];
      dayVisits.push(visit);
      map.set(visit.date, dayVisits);
    });
    return map;
  }, [state.visits]);

  const compliance = useMemo<ComplianceRow[]>(() => {
    return state.accounts.map((account) => {
      const required = Math.max(0, Number(state.gradeRules[account.grade] ?? 0));
      const planned = state.visits.filter((visit) => visit.accountId === account.id).length;
      const status = planned >= required ? "Compliant" : planned === 0 ? "Missed" : "At risk";
      return { account, required, planned, status };
    });
  }, [state.accounts, state.gradeRules, state.visits]);

  const areaOptions = useMemo(() => Array.from(new Set(state.accounts.map((account) => account.area).filter(Boolean))).sort(), [state.accounts]);
  const filteredCompliance = useMemo(() => {
    const query = pharmacySearch.trim().toLowerCase();
    return compliance.filter((row) => {
      const account = row.account;
      const searchMatch = !query || [account.name, account.practiceNumber, account.town, account.area, account.address].some((value) => String(value ?? "").toLowerCase().includes(query));
      const areaMatch = areaFilter === "all" || account.area === areaFilter;
      const gradeMatch = gradeFilter === "all" || account.grade === gradeFilter;
      const activeMatch = activeFilter === "all" || (activeFilter === "active" ? account.active !== false : account.active === false);
      return searchMatch && areaMatch && gradeMatch && activeMatch;
    });
  }, [activeFilter, areaFilter, compliance, gradeFilter, pharmacySearch]);
  const assignedDirectoryIds = useMemo(() => new Set(state.accounts.map((account) => account.directoryPharmacyId).filter(Boolean)), [state.accounts]);
  const assignedPracticeNumbers = useMemo(() => new Set(state.accounts.map((account) => account.practiceNumber).filter(Boolean)), [state.accounts]);

  const metrics = useMemo(() => {
    const required = compliance.reduce((sum, row) => sum + row.required, 0);
    const planned = state.visits.length;
    const overloadDays = availableDays.filter((day) => (visitsByDay.get(day)?.length ?? 0) > state.dailyCapacity).length;
    const underloadDays = availableDays.filter((day) => {
      const count = visitsByDay.get(day)?.length ?? 0;
      return state.visits.length > 0 && count > 0 && count < state.minDailyCalls;
    }).length;
    const blockedVisits = state.visits.filter((visit) => !availableDays.includes(visit.date)).length;
    const compliantAccounts = compliance.filter((row) => row.status === "Compliant").length;
    return {
      required,
      planned,
      overloadDays,
      underloadDays,
      blockedVisits,
      compliantAccounts,
      complianceRate: compliance.length ? Math.round((compliantAccounts / compliance.length) * 100) : 0,
      capacity: availableDays.length * state.dailyCapacity,
    };
  }, [availableDays, compliance, state.dailyCapacity, state.minDailyCalls, state.visits, visitsByDay]);

  const activeAssignedAccounts = useMemo(() => state.accounts.filter((account) => account.active !== false), [state.accounts]);
  const activeAssignedCount = useMemo(() => {
    const keys = new Set(activeAssignedAccounts.map((account) => account.directoryPharmacyId || account.practiceNumber || account.id));
    return keys.size;
  }, [activeAssignedAccounts]);
  const filteredActiveCount = useMemo(() => filteredCompliance.filter((row) => row.account.active !== false).length, [filteredCompliance]);
  const selectedVisits = visitsByDay.get(selectedDay) ?? [];
  const selectedVisitAccounts = selectedVisits.map((visit) => accountById.get(visit.accountId)).filter((account): account is Account => Boolean(account));
  const selectedAreas = Array.from(new Set(selectedVisitAccounts.map((account) => account.area).filter(Boolean)));
  const selectedDaySpanKm = daySpanKm(selectedVisitAccounts.map((account) => ({ account: enrichLocation(account) })));
  const selectedApproxCount = selectedVisitAccounts.filter((account) => locationConfidence(enrichLocation(account)) === "approximate").length;
  const selectedUnknownCount = selectedVisitAccounts.filter((account) => locationConfidence(enrichLocation(account)) === "unknown").length;
  const selectedMainRegion = selectedVisitAccounts.length ? routeRegion(selectedVisitAccounts[0].area) : "";
  const selectedDayHasTravelWarning = selectedDaySpanKm > proximityRules.strongPenaltyKm || selectedUnknownCount > 0;
  const planHasLocationWarnings = state.visits.some((visit) => {
    const account = accountById.get(visit.accountId);
    return account ? locationConfidence(enrichLocation(account)) !== "exact" : false;
  });
  const nonFieldSet = new Set(state.nonFieldDays.map((day) => day.date));
  const tabs: Array<{ key: TabKey; label: string; icon: typeof Gauge }> = [
    { key: "overview", label: "Overview", icon: Gauge },
    { key: "pharmacies", label: "Pharmacies", icon: Table2 },
    { key: "monthly-plan", label: "Monthly Plan", icon: CalendarDays },
    { key: "availability", label: "Availability", icon: CalendarDays },
    { key: "team", label: "Team", icon: Users },
    { key: "settings", label: "Settings", icon: Settings2 },
  ];
  const visibleTabs = tabs.filter((tab) => !supabaseConfig.configured || tab.key !== "team" || profile?.role === "manager" || profile?.role === "admin");

  function updateRule(grade: string, value: number) {
    setState((current) => ({ ...current, gradeRules: { ...current.gradeRules, [grade]: value } }));
  }

  async function loadWorkspace(activeSession: AuthSession, requestedMonth = state.month, mode: "initial" | "month" = "initial") {
    const requestId = workspaceRequestId.current + 1;
    workspaceRequestId.current = requestId;
    const initialLoad = mode === "initial";
    if (initialLoad) {
      setWorkspaceStatus("loading");
      setWorkspaceError("");
    } else {
      setIsLoadingMonthlyPlan(true);
      setMonthlyPlanError("");
    }
    try {
      const userProfilePromise = profile ? Promise.resolve(profile) : getProfile(activeSession.user.id);
      const [userProfile, pharmacyRows, blockedRows, loadedPlan, userNotifications] = await Promise.all([
        userProfilePromise,
        listRepPharmacies(activeSession.user.id),
        listBlockedDates(activeSession.user.id, requestedMonth),
        loadLatestMonthlyPlan(activeSession.user.id, requestedMonth),
        initialLoad ? listNotifications(activeSession.user.id).catch(() => []) : Promise.resolve(notifications),
      ]);
      if (workspaceRequestId.current !== requestId) return;
      setProfile(userProfile);
      if (initialLoad) setNotifications(userNotifications.map((item) => ({ id: item.id, title: item.title, body: item.body, read_at: item.read_at })));
      setSavedPlanId(loadedPlan?.plan.id ?? null);
      setState((current) => {
        const next = stateFromSupabase(current, pharmacyRows, blockedRows);
        if (!loadedPlan) return { ...next, month: requestedMonth, visits: [] };
        const dayById = new Map(loadedPlan.days.map((day) => [day.id, day.date]));
        return {
          ...next,
          month: requestedMonth,
          visits: loadedPlan.visits
            .filter((visit) => visit.status === "scheduled" && visit.plan_day_id)
            .map((visit) => ({
              id: visit.id,
              accountId: visit.rep_pharmacy_id,
              date: dayById.get(visit.plan_day_id!) ?? requestedMonth,
              locked: visit.manually_moved,
            })),
        };
      });
      setWorkspaceStatus("ready");
    } catch (error) {
      if (workspaceRequestId.current !== requestId) return;
      if (isExpiredAuthError(error)) {
        clearStoredSession();
        setSession(null);
        setProfile(null);
        setWorkspaceStatus("idle");
        setWorkspaceError("");
        setIsLoadingMonthlyPlan(false);
        setMonthlyPlanError("");
        setAuthMode("sign-in");
        setAuthError("Your session expired. Please sign in again.");
        return;
      }
      if (initialLoad) {
        setWorkspaceStatus("error");
        setWorkspaceError("We couldn’t load your workspace. Please try again.");
      } else {
        setMonthlyPlanError("We couldn’t load this month’s plan. Please try again.");
      }
    } finally {
      if (workspaceRequestId.current === requestId) setIsLoadingMonthlyPlan(false);
    }
  }

  async function handleAuthSubmit() {
    setAuthBusy(true);
    setAuthError("");
    try {
      if (authMode === "forgot") {
        await requestPasswordReset(authForm.email);
        setAuthError("Password reset email requested. Check your inbox, then try again if it does not arrive.");
      } else {
        if (authMode === "sign-up") {
          const result = await signUpWithPassword(authForm.email, authForm.password, authForm.fullName);
          if (result.status === "authenticated") {
            setSession(result.session);
            return;
          }
          setPendingConfirmationEmail(result.email);
          setAuthMode("check-email");
          return;
        }
        const nextSession = await signInWithPassword(authForm.email, authForm.password);
        setSession(nextSession);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResendConfirmation() {
    const email = pendingConfirmationEmail || authForm.email;
    if (!email) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      await resendSignUpConfirmation(email);
      setAuthError("Confirmation email sent again. Please check your inbox.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not resend the confirmation email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setSession(null);
    setProfile(null);
    setWorkspaceStatus("idle");
    setToastNotifications([]);
    setState(defaultStateForMonth());
  }

  async function persistCurrentPlan(reason: string, nextVisits = state.visits) {
    if (!supabaseConfig.configured || !session?.user.id) return;
    const byDay = new Map<string, Visit[]>();
    nextVisits.forEach((visit) => {
      const rows = byDay.get(visit.date) ?? [];
      rows.push(visit);
      byDay.set(visit.date, rows);
    });
    const planId = await saveMonthlyPlan({
      month: state.month,
      status: metrics.required > nextVisits.length ? "unresolved" : "review",
      generationMode: "approximate",
      settingsSnapshot: {
        gradeRules: state.gradeRules,
        dailyCapacity: state.dailyCapacity,
        minDailyCalls: state.minDailyCalls,
        cycleStartDay: state.cycleStartDay,
        routeStartAddress: state.routeStartAddress,
      },
      requiredVisitCount: metrics.required,
      scheduledVisitCount: nextVisits.length,
      unresolvedVisitCount: Math.max(0, metrics.required - nextVisits.length),
      availableCapacity: metrics.capacity,
      days: allDays.map((day) => {
        const dayVisits = byDay.get(day) ?? [];
        const primaryArea = Array.from(new Set(dayVisits.map((visit) => accountById.get(visit.accountId)?.area).filter(Boolean))).join(", ");
        return {
          date: day,
          locked: dayVisits.some((visit) => visit.locked),
          manuallyModified: dayVisits.some((visit) => visit.locked),
          primaryArea,
          visitCount: dayVisits.length,
          routeMode: "approximate",
        };
      }),
      visits: nextVisits.map((visit, index) => ({
        repPharmacyId: visit.accountId,
        occurrenceNumber: occurrenceNumberFromVisit(visit),
        date: visit.date,
        stopOrder: index + 1,
        status: "scheduled",
        manuallyMoved: Boolean(visit.locked),
      })),
      reason,
    });
    setSavedPlanId(planId);
  }

  async function importLegacyLocalState() {
    if (!session?.user.id) return;
    const legacy = loadState();
    if (!legacy.accounts.length) {
      setImportNotice({ tone: "warn", message: "No existing demo pharmacies were found." });
      return;
    }
    try {
      const rows = await confirmCsvImport(session.user.id, "existing demo data", legacy.accounts.map(pharmacyInputFromAccount), {
        totalRows: legacy.accounts.length,
        validRows: legacy.accounts.length,
        matchedRows: 0,
        unmatchedRows: legacy.accounts.length,
        duplicateRows: 0,
        errorRows: 0,
      });
      await Promise.all(legacy.nonFieldDays.map((day) => upsertBlockedDate({
        repId: session.user.id,
        date: day.date,
        type: toBlockedType(day.type),
        reason: day.reason,
        createdBy: session.user.id,
        source: "legacy",
      })));
      setState((current) => ({ ...current, accounts: rows.map(accountFromPharmacyRow), nonFieldDays: legacy.nonFieldDays, visits: [] }));
      setImportNotice({ tone: "good", message: `Imported ${rows.length} pharmacies and ${legacy.nonFieldDays.length} unavailable dates into your workspace.` });
    } catch (error) {
      setImportNotice({ tone: "bad", message: error instanceof Error ? error.message : "Import could not be completed." });
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseImportFile(file);
      if (!result.accounts.length) {
        setImportNotice({ tone: "bad", message: `Import failed: ${result.warnings.join(" ")}` });
        return;
      }
      const existingKeys = new Set(state.accounts.map((account) => (account.practiceNumber || account.id || account.name).toLowerCase()));
      const newAccounts = result.accounts.filter((account) => !existingKeys.has((account.practiceNumber || account.id || account.name).toLowerCase()));
      const duplicateRows = result.accounts.length - newAccounts.length;
      const summary = `${newAccounts.length} new pharmacies will be imported${duplicateRows ? `, ${duplicateRows} already in your territory will be skipped` : ""}.`;
      if (!window.confirm(summary)) return;
      importAccounts({ ...result, accounts: newAccounts, warnings: duplicateRows ? [...result.warnings, `${duplicateRows} pharmacies were already in your territory and were skipped.`] : result.warnings }, file.name, "interactive");
    } catch {
      setImportNotice({ tone: "bad", message: "We couldn’t read that pharmacy file. Check the format and try again." });
    } finally {
      event.target.value = "";
    }
  }

  function importAccounts(resultOrText: ImportResult | string, sourceName: string, mode: "silent" | "interactive" = "interactive") {
    const result = typeof resultOrText === "string" ? parseCsv(resultOrText) : resultOrText;
    if (result.accounts.length) {
      const grades = new Set(result.accounts.map((account) => account.grade));
      const nextRules = { ...state.gradeRules };
      grades.forEach((grade) => {
        if (nextRules[grade] === undefined) nextRules[grade] = 1;
      });
      setState((current) => {
        const existing = new Set(current.accounts.map((account) => (account.practiceNumber || account.id || account.name).toLowerCase()));
        const additions = result.accounts.filter((account) => !existing.has((account.practiceNumber || account.id || account.name).toLowerCase()));
        return { ...current, accounts: [...current.accounts, ...additions], gradeRules: nextRules, visits: [] };
      });
      setSelectedDay("");
      if (supabaseConfig.configured && session?.user.id && mode === "interactive") {
        confirmCsvImport(session.user.id, sourceName, result.accounts.map(pharmacyInputFromAccount), {
          totalRows: result.accounts.length + result.warnings.length,
          validRows: result.accounts.length,
          matchedRows: result.accounts.filter((account) => account.directoryPharmacyId).length,
          unmatchedRows: result.accounts.filter((account) => !account.directoryPharmacyId).length,
          duplicateRows: result.warnings.filter((warning) => warning.toLowerCase().includes("duplicate") || warning.toLowerCase().includes("already")).length,
          errorRows: 0,
        })
          .then((rows) => {
            setState((current) => ({ ...current, accounts: rows.map(accountFromPharmacyRow), visits: [] }));
            setImportNotice({
              tone: result.warnings.length ? "warn" : "good",
              message: `Imported ${rows.length} pharmacies from ${sourceName}.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""}`,
            });
          })
          .catch(() => {
            setImportNotice({ tone: "bad", message: "We couldn’t save the imported pharmacies. Please try again." });
          });
      }
      if (mode === "interactive") {
        setActiveTab("pharmacies");
        if (!supabaseConfig.configured || !session?.user.id) {
          setImportNotice({
            tone: result.warnings.length ? "warn" : "good",
            message: `Imported ${result.accounts.length} pharmacies from ${sourceName}.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""}`,
          });
        }
      }
    } else {
      setImportNotice({ tone: "bad", message: `Import failed: ${result.warnings.join(" ")}` });
    }
  }

  function loadDemoList(mode: "silent" | "interactive" = "interactive") {
    fetch(DEMO_LIST_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Demo list not found");
        return response.text();
      })
      .then((text) => {
        importAccounts(text, "demo pharmacy list", mode);
      })
      .catch(() => {
        setImportNotice({ tone: "bad", message: "Could not load the demo pharmacy list." });
      }
    );
  }

  function addNonFieldDay() {
    if (!newNonField.date || !newNonField.reason.trim()) return;
    if (supabaseConfig.configured && session?.user.id) {
      upsertBlockedDate({
        repId: session.user.id,
        date: newNonField.date,
        type: toBlockedType(newNonField.type),
        reason: newNonField.reason.trim(),
        createdBy: session.user.id,
      }).catch((error) => {
        setImportNotice({ tone: "bad", message: error instanceof Error ? error.message : "Unavailable date could not be saved." });
      });
    }
    setState((current) => ({
      ...current,
      nonFieldDays: [...current.nonFieldDays.filter((day) => day.date !== newNonField.date), { ...newNonField, reason: newNonField.reason.trim() }],
      visits: current.visits.filter((visit) => visit.date !== newNonField.date),
    }));
    setNewNonField((current) => ({ ...current, reason: "" }));
    setImportNotice({ tone: "good", message: "Unavailable date added." });
  }

  function removeUnavailableDate(date: string) {
    if (supabaseConfig.configured && session?.user.id) {
      deleteBlockedDateByDate(session.user.id, date).catch((error) => {
        setImportNotice({ tone: "bad", message: error instanceof Error ? error.message : "Unavailable date could not be deleted." });
      });
    }
    setState((current) => ({
      ...current,
      nonFieldDays: current.nonFieldDays.filter((item) => item.date !== date),
      visits: current.visits.filter((visit) => visit.date !== date),
    }));
    setImportNotice({ tone: "good", message: "Unavailable date removed." });
  }

  function moveVisit(visitId: string, date: string) {
    const nextVisits = state.visits.map((visit) => (visit.id === visitId ? { ...visit, date, locked: true } : visit));
    setState((current) => ({
      ...current,
      visits: current.visits.map((visit) => (visit.id === visitId ? { ...visit, date, locked: true } : visit)),
    }));
    setImportNotice({ tone: "good", message: "Visit moved." });
    persistCurrentPlan("move visit", nextVisits).catch((error) => setImportNotice({ tone: "bad", message: error instanceof Error ? error.message : "Visit move could not be saved." }));
  }

  function removeVisit(visitId: string) {
    const nextVisits = state.visits.filter((visit) => visit.id !== visitId);
    setState((current) => ({ ...current, visits: current.visits.filter((visit) => visit.id !== visitId) }));
    setImportNotice({ tone: "good", message: "Visit removed." });
    persistCurrentPlan("remove visit", nextVisits).catch((error) => setImportNotice({ tone: "bad", message: error instanceof Error ? error.message : "Visit removal could not be saved." }));
  }

  function swapDayCalls(sourceDay: string, targetDay: string) {
    if (!sourceDay || !targetDay || sourceDay === targetDay) return;
    const nextVisits = state.visits.map((visit) => {
      if (visit.date === sourceDay) return { ...visit, date: targetDay, locked: true };
      if (visit.date === targetDay) return { ...visit, date: sourceDay, locked: true };
      return visit;
    });
    setState((current) => ({
      ...current,
      visits: current.visits.map((visit) => {
        if (visit.date === sourceDay) return { ...visit, date: targetDay, locked: true };
        if (visit.date === targetDay) return { ...visit, date: sourceDay, locked: true };
        return visit;
      }),
    }));
    setSelectedDay(targetDay);
    setSwapTargetDay("");
    setImportNotice({ tone: "good", message: "Day calls swapped." });
    persistCurrentPlan("swap day", nextVisits).catch((error) => setImportNotice({ tone: "bad", message: error instanceof Error ? error.message : "Day swap could not be saved." }));
  }

  function regenerateFromDate(changeDate: string, nextNonFieldDays = state.nonFieldDays) {
    setState((current) => {
      const preserved = current.visits.filter((visit) => visit.date < changeDate);
      const generated = generatePlan(
        current.accounts,
        current.gradeRules,
        current.month,
        nextNonFieldDays,
        current.dailyCapacity,
        current.minDailyCalls,
        current.cycleStartDay,
        { lat: current.routeStartLat, lng: current.routeStartLng },
      ).filter((visit) => visit.date >= changeDate);
      const preservedCounts = new Map<string, number>();
      preserved.forEach((visit) => preservedCounts.set(visit.accountId, (preservedCounts.get(visit.accountId) ?? 0) + 1));
      const futureCounts = new Map<string, number>();
      const remainingFuture = generated.filter((visit) => {
        const account = current.accounts.find((item) => item.id === visit.accountId);
        const required = Math.max(0, Number(current.gradeRules[account?.grade ?? ""] ?? 0));
        const already = preservedCounts.get(visit.accountId) ?? 0;
        const future = futureCounts.get(visit.accountId) ?? 0;
        if (already + future >= required) return false;
        futureCounts.set(visit.accountId, future + 1);
        return true;
      });
      return { ...current, nonFieldDays: nextNonFieldDays, visits: [...preserved, ...remainingFuture] };
    });
  }

  async function loadSampleTerritory() {
    if (!demoMode) return;
    if (state.accounts.some((account) => account.active !== false)) {
      setImportNotice({ tone: "warn", message: "Your territory already has pharmacies, so the sample territory was not loaded again." });
      return;
    }
    try {
      if (supabaseConfig.configured && session?.user.id) {
        const rows = await initializeDemoSalesRepWorkspace();
        setState((current) => ({ ...current, accounts: rows.map(accountFromPharmacyRow), visits: [] }));
        setImportNotice({ tone: "good", message: `Loaded ${rows.length} Western Cape pharmacies into your territory.` });
      } else {
        loadDemoList("interactive");
      }
    } catch {
      setImportNotice({ tone: "bad", message: "We couldn’t load the sample territory. Please try again." });
    }
  }

  async function addSelectedDirectoryPharmacies() {
    if (!selectedDirectoryIds.length) return;
    try {
      const rows = await Promise.all(selectedDirectoryIds.map((id) => addDirectoryPharmacyToMyList(id, "B")));
      const refreshed = supabaseConfig.configured && session?.user.id ? await listRepPharmacies(session.user.id) : rows;
      setState((current) => ({ ...current, accounts: refreshed.map(accountFromPharmacyRow), visits: [] }));
      setSelectedDirectoryIds([]);
      setDirectoryOpen(false);
      setImportNotice({ tone: "good", message: `Added ${rows.length} pharmacies to your territory.` });
    } catch {
      setImportNotice({ tone: "bad", message: "We couldn’t add those pharmacies. Please try again." });
    }
  }

  async function removeAccount(account: Account) {
    try {
      if (supabaseConfig.configured && session?.user.id) {
        await archiveRepPharmacy(account.id);
      }
      setState((current) => ({ ...current, accounts: current.accounts.filter((item) => item.id !== account.id), visits: current.visits.filter((visit) => visit.accountId !== account.id) }));
      setImportNotice({ tone: "good", message: `${account.name} was removed from your territory.` });
    } catch {
      setImportNotice({ tone: "bad", message: "We couldn’t remove that pharmacy. Please try again." });
    }
  }

  function resetSample() {
    loadDemoList("interactive");
  }

  async function generate() {
    if (isGenerating) return;
    if (state.visits.length && !window.confirm("Regenerating the plan will replace your current visit arrangement.")) return;
    setIsGenerating(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const nextVisits = generatePlan(
        state.accounts,
        state.gradeRules,
        state.month,
        state.nonFieldDays,
        state.dailyCapacity,
        state.minDailyCalls,
        state.cycleStartDay,
        { lat: state.routeStartLat, lng: state.routeStartLng },
      );
      setState((current) => ({
        ...current,
        visits: nextVisits,
      }));
      await persistCurrentPlan("generate plan", nextVisits);
      setImportNotice({ tone: "good", message: `Your ${new Date(`${state.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })} visit plan has been generated.` });
    } catch (error) {
      setImportNotice({ tone: "bad", message: error instanceof Error ? error.message : "Plan could not be generated." });
    } finally {
      setIsGenerating(false);
    }
  }

  function addManagerTrainingDay() {
    if (!state.managerTrainingDate) return;
    const nextNonFieldDays = [
      ...state.nonFieldDays.filter((day) => day.date !== state.managerTrainingDate),
      { date: state.managerTrainingDate, type: "Training" as const, reason: state.managerNotice.trim() || "Manager training day" },
    ];
    regenerateFromDate(state.managerTrainingDate, nextNonFieldDays);
    setImportNotice({ tone: "warn", message: `Team event added on ${state.managerTrainingDate}. Future visits were recalculated from that date only.` });
  }

  if (!supabaseConfig.configured && !allowLocalPrototype) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="brand inline-brand">
            <div className="brand-mark">CP</div>
            <div>
              <strong>CPA Planner</strong>
              <span>Supabase setup required</span>
            </div>
          </div>
          <div className="notice warn">Persistent demo mode needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The app will not silently store pharmacy lists or plans in browser storage when Supabase mode is expected.</div>
          <div className="setup-list">
            <span>1. Apply the Supabase migrations to the confirmed demo project.</span>
            <span>2. Add the client-safe environment variables from `.env.example`.</span>
            <span>3. Restart the Vite dev server.</span>
          </div>
          <button className="button secondary" onClick={() => setAllowLocalPrototype(true)}>Open local prototype mode</button>
        </div>
      </div>
    );
  }

  if (supabaseConfig.configured && authInitState === "checking") {
    return <div className="auth-shell"><div className="auth-panel"><strong>Checking sign-in...</strong><span>Restoring your CPA Planner session.</span></div></div>;
  }

  if (supabaseConfig.configured && authInitState === "error") {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="brand inline-brand">
            <div className="brand-mark">CP</div>
            <div>
              <strong>CPA Planner</strong>
              <span>Authentication problem</span>
            </div>
          </div>
          <div className="notice bad">{authError || "We could not complete the sign-in link. Please try again."}</div>
          <button className="button secondary full" onClick={() => {
            setAuthError("");
            setAuthInitState("ready");
            setAuthMode("sign-in");
          }}>Return to sign in</button>
        </div>
      </div>
    );
  }

  if (supabaseConfig.configured && !session) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="brand inline-brand">
            <div className="brand-mark">CP</div>
            <div>
              <strong>CPA Planner</strong>
              <span>{authMode === "check-email" ? "Confirm account" : authMode === "sign-up" ? "Create sales rep account" : authMode === "forgot" ? "Reset password" : "Sign in"}</span>
            </div>
          </div>
          {authMode === "check-email" ? (
            <div className="auth-form">
              <strong>Check your email</strong>
              <span className="muted-copy">We sent a confirmation link to {pendingConfirmationEmail || authForm.email}. Open the link to activate your account.</span>
              {authError && <div className={authError.includes("sent") ? "notice good" : "notice bad"}>{authError}</div>}
              <button className="button primary full" onClick={handleResendConfirmation} disabled={authBusy}>{authBusy ? "Sending..." : "Resend confirmation email"}</button>
              <div className="auth-links">
                <button onClick={() => {
                  setAuthError("");
                  setAuthMode("sign-in");
                }}>Return to sign in</button>
                <button onClick={() => {
                  setAuthError("");
                  setPendingConfirmationEmail("");
                  setAuthMode("sign-up");
                }}>Change email</button>
              </div>
            </div>
          ) : (
            <div className="auth-form">
              {authMode === "sign-up" && <label>Full name<input value={authForm.fullName} onChange={(event) => setAuthForm((current) => ({ ...current, fullName: event.target.value }))} /></label>}
              <label>Email<input type="email" value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} /></label>
              {authMode !== "forgot" && <label>Password<input type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} /></label>}
              {authError && <div className={authError.includes("requested") ? "notice good" : "notice bad"}>{authError}</div>}
              <button className="button primary full" onClick={handleAuthSubmit} disabled={authBusy}>{authBusy ? "Working..." : authMode === "sign-up" ? "Create account" : authMode === "forgot" ? "Request reset" : "Sign in"}</button>
              <div className="auth-links">
                <button onClick={() => setAuthMode("sign-in")}>Sign in</button>
                <button onClick={() => setAuthMode("sign-up")}>Create account</button>
                <button onClick={() => setAuthMode("forgot")}>Forgot password</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (supabaseConfig.configured && workspaceStatus === "loading") {
    return <div className="auth-shell"><div className="auth-panel"><strong>Loading workspace...</strong><span>Restoring your planner data.</span></div></div>;
  }

  if (supabaseConfig.configured && workspaceStatus === "error") {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <strong>Could not load workspace</strong>
          <div className="notice bad">{workspaceError}</div>
          <button className="button secondary" onClick={() => session && loadWorkspace(session, state.month, "initial")}>Retry</button>
          <button className="button secondary" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CP</div>
          <div>
            <strong>CPA Planner</strong>
            <span>Monthly field planning</span>
          </div>
        </div>
        <nav>
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{visibleTabs.find((tab) => tab.key === activeTab)?.label ?? "CPA Planner"}</h1>
            <p>{activeTab === "pharmacies" ? "Manage the pharmacies assigned to your Western Cape territory." : activeTab === "monthly-plan" ? "Build and adjust your monthly pharmacy visit plan." : activeTab === "availability" ? "Mark field days, leave, training and holidays." : "Plan pharmacy visits and monitor coverage."}</p>
          </div>
          <div className="actions">
            {notifications.filter((item) => !item.read_at).length > 0 && <span className="notification-badge">{notifications.filter((item) => !item.read_at).length} unread</span>}
            {activeTab === "monthly-plan" && state.visits.length > 0 && (
              <button className="button secondary" onClick={() => exportCalendarCsv(state.visits, state.accounts, allDays, state.nonFieldDays)}><Download size={16} /> Export calendar</button>
            )}
            {activeTab === "monthly-plan" && (
              <button className="button primary" onClick={generate} disabled={isGenerating || isLoadingMonthlyPlan}><Play size={16} /> {isGenerating ? "Building your visit plan…" : "Generate plan"}</button>
            )}
            {supabaseConfig.configured && <button className="button secondary" onClick={handleSignOut}>Sign out</button>}
          </div>
        </header>

        {activeTab === "overview" && (
          <section className="metric-grid compact-three">
            <Metric label="Plan status" value={state.visits.length ? "Draft" : "Not planned"} detail={`${metrics.planned}/${metrics.required} required visits scheduled`} tone={state.visits.length && metrics.planned >= metrics.required ? "good" : "warn"} />
            <Metric label="Available capacity" value={String(metrics.capacity)} detail={`${availableDays.length} field days · max ${state.dailyCapacity}/day`} tone={metrics.capacity >= metrics.required ? "good" : "warn"} />
            <Metric label="Exceptions" value={String(metrics.overloadDays + metrics.underloadDays + metrics.blockedVisits)} detail={`${metrics.overloadDays} over max · ${metrics.underloadDays} under target · ${metrics.blockedVisits} blocked`} tone={metrics.overloadDays || metrics.blockedVisits ? "bad" : metrics.underloadDays ? "warn" : "good"} />
          </section>
        )}

        <ToastStack notifications={toastNotifications} onDismiss={dismissNotification} />

        {activeTab === "overview" && (
          <section className="overview-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Next action</h2>
                  <span>Keep the workflow moving without showing the full calendar here.</span>
                </div>
              </div>
              <div className="action-list">
                <button className="action-row" onClick={() => setActiveTab(state.accounts.length ? "monthly-plan" : "pharmacies")}>
                  <strong>{state.accounts.length ? state.visits.length ? "Review monthly plan" : `Generate ${new Date(`${state.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })} plan` : "Import your pharmacies"}</strong>
                  <span>{state.accounts.length ? `${state.accounts.length} pharmacies · ${metrics.required} required visits` : "Start with CSV import or the demo workspace."}</span>
                </button>
                <button className="action-row" onClick={() => setActiveTab("availability")}>
                  <strong>Check availability</strong>
                  <span>{state.nonFieldDays.length} unavailable dates configured for this cycle.</span>
                </button>
                <button className="action-row" onClick={() => setActiveTab("pharmacies")}>
                  <strong>Resolve location quality</strong>
                  <span>{state.accounts.filter((account) => account.coordinateConfidence === "Area-level" || account.lat === undefined || account.lng === undefined).length} pharmacies need reviewed locations before route planning can be more precise.</span>
                </button>
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Current warnings</h2>
                  <span>Planning completeness, not real-world completed visits.</span>
                </div>
              </div>
              <div className="warning-list">
                {metrics.capacity < metrics.required && <div className="notice bad">Capacity is {metrics.required - metrics.capacity} visits short. Increase max visits, enable more field days, or reduce required frequency.</div>}
                {metrics.underloadDays > 0 && <div className="notice warn">{metrics.underloadDays} planned days are below the soft daily target.</div>}
                {metrics.blockedVisits > 0 && <div className="notice bad">{metrics.blockedVisits} visits are currently on unavailable dates.</div>}
                {metrics.capacity >= metrics.required && metrics.underloadDays === 0 && metrics.blockedVisits === 0 && <div className="empty-state">No blocking warnings for the current draft.</div>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "monthly-plan" && <section className="layout-grid">
          <div className="panel planner-panel">
            <div className="panel-header">
              <div>
                <h2>Calendar plan</h2>
                <span>Move visits between field days to adjust the month.</span>
              </div>
              <div className="month-tools">
                <input aria-label="Planning month" type="month" value={state.month} aria-busy={isLoadingMonthlyPlan} onChange={(event) => setState((current) => ({ ...current, month: event.target.value, visits: supabaseConfig.configured ? current.visits : [] }))} />
                {isLoadingMonthlyPlan && <span className="month-loading">Loading {new Date(`${state.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long" })} plan…</span>}
                <label>Cycle start <input type="number" min="1" max="28" value={state.cycleStartDay} onChange={(event) => setState((current) => ({ ...current, cycleStartDay: Number(event.target.value), visits: [] }))} /></label>
                <label>Min <input type="number" min="0" max={state.dailyCapacity} value={state.minDailyCalls} onChange={(event) => setState((current) => ({ ...current, minDailyCalls: Number(event.target.value) }))} /></label>
                <label>Max <input type="number" min="1" value={state.dailyCapacity} onChange={(event) => setState((current) => ({ ...current, dailyCapacity: Number(event.target.value), minDailyCalls: Math.min(current.minDailyCalls, Number(event.target.value)) }))} /></label>
              </div>
            </div>
            {planHasLocationWarnings && state.visits.length > 0 && <div className="notice warn compact-notice"><AlertTriangle size={16} /><span>Some pharmacy locations are approximate or missing. Review the highlighted visits before finalising your plan.</span></div>}
            <div className="calendar-frame">
              {monthlyPlanError && <div className="calendar-load-error"><span>{monthlyPlanError}</span><button className="button secondary" onClick={() => session && loadWorkspace(session, state.month, "month")}>Try again</button></div>}
              {isLoadingMonthlyPlan && <div className="calendar-loading-overlay">Loading {new Date(`${state.month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long" })} plan…</div>}
              <div className="calendar-grid">
              {allDays.map((day) => {
                const count = visitsByDay.get(day)?.length ?? 0;
                const blocked = isWeekend(day) || nonFieldSet.has(day);
                const overload = count > state.dailyCapacity;
                const underload = !blocked && count > 0 && count < state.minDailyCalls;
                const isToday = day === todayKey();
                const dayAccounts = (visitsByDay.get(day) ?? []).map((visit) => accountById.get(visit.accountId)).filter((account): account is Account => Boolean(account));
                const geographicWarning = daySpanKm(dayAccounts.map((account) => ({ account: enrichLocation(account) }))) > proximityRules.strongPenaltyKm || dayAccounts.some((account) => locationConfidence(enrichLocation(account)) === "unknown");
                const blockedText = blockedLabel(day, state.nonFieldDays);
                return (
                  <button
                    key={day}
                    className={`day-cell ${selectedDay === day ? "selected" : ""} ${isToday ? "today" : ""} ${blocked ? "blocked" : ""} ${overload ? "overload" : ""} ${underload ? "underload" : ""} ${geographicWarning ? "geo-warning" : ""}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span>{dayLabel(day)}</span>
                    <strong>{blocked ? blockedText : `${count} visits`}</strong>
                  </button>
                );
              })}
              </div>
            </div>
          </div>

          <div className="panel day-panel">
            <div className="panel-header">
              <div>
                <h2>{selectedDay || "Select a day"}</h2>
                <span>{selectedVisits.length} planned visits{selectedAreas.length ? ` · ${selectedAreas.slice(0, 3).join(", ")}${selectedAreas.length > 3 ? ` +${selectedAreas.length - 3}` : ""}` : ""}</span>
                {selectedVisits.length > 1 && <small className={selectedDayHasTravelWarning ? "day-quality warn" : "day-quality"}>{selectedMainRegion} · Approx. {Math.round(selectedDaySpanKm)} km span{selectedApproxCount ? ` · ${selectedApproxCount} approximate` : ""}{selectedUnknownCount ? ` · ${selectedUnknownCount} needs review` : ""}</small>}
              </div>
              <div className="swap-tools">
                <select value={swapTargetDay} onChange={(event) => setSwapTargetDay(event.target.value)} title="Swap with day">
                  <option value="">Swap day</option>
                  {availableDays.filter((day) => day !== selectedDay).map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
                <button className="button secondary" onClick={() => swapDayCalls(selectedDay, swapTargetDay)} disabled={!swapTargetDay || isLoadingMonthlyPlan}>Swap</button>
              </div>
            </div>
            <div className="visit-list">
              {selectedVisits.length === 0 && <div className="empty-state">No visits planned for this day.</div>}
              {selectedVisits.map((visit) => {
                const account = accountById.get(visit.accountId);
                if (!account) return null;
                return (
                  <div className="visit-row" key={visit.id}>
                    <div>
                      <strong>{account.name}</strong>
                      <span>{account.area} · Grade {account.grade}</span>
                    </div>
                    <select value={visit.date} onChange={(event) => moveVisit(visit.id, event.target.value)} title="Move visit">
                      {availableDays.map((day) => <option key={day} value={day}>{day}</option>)}
                    </select>
                    <button className="icon-button" onClick={() => removeVisit(visit.id)} title="Remove visit"><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>}

        {false && <section className="lower-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Compliance risk</h2>
                <span>Pharmacies needing attention before the month starts.</span>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Pharmacy</th><th>Grade</th><th>Plan</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {compliance.map((row) => (
                    <tr key={row.account.id}>
                      <td><strong>{row.account.name}</strong><span>{row.account.area}</span></td>
                      <td>{row.account.grade}</td>
                      <td>{row.planned}/{row.required}</td>
                      <td><StatusPill status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Territory view</h2>
                <span>Light geographic grouping for route-aware planning.</span>
              </div>
            </div>
            <TerritoryMap accounts={state.accounts} compliance={compliance} />
          </div>

          <div className="panel settings-panel">
            <div className="panel-header">
              <div>
                <h2>Rules and constraints</h2>
                <span>Frequency, capacity, and blocked field days.</span>
              </div>
            </div>
            <div className="rule-list">
              {Object.keys(state.gradeRules).sort().map((grade) => (
                <label key={grade} className="rule-row">Grade {grade}<input type="number" min="0" value={state.gradeRules[grade]} onChange={(event) => updateRule(grade, Number(event.target.value))} /><span>visits/mo</span></label>
              ))}
              <label className="rule-row">Min visits/day<input type="number" min="0" max={state.dailyCapacity} value={state.minDailyCalls} onChange={(event) => setState((current) => ({ ...current, minDailyCalls: Number(event.target.value) }))} /><span>visits</span></label>
              <label className="rule-row">Cycle start<input type="number" min="1" max="28" value={state.cycleStartDay} onChange={(event) => setState((current) => ({ ...current, cycleStartDay: Number(event.target.value), visits: [] }))} /><span>day</span></label>
              <button className="button secondary full" onClick={resetSample}><Users size={16} /> Restore demo pharmacies</button>
            </div>
            <div className="route-start">
              <label>
                <span>Rep home address</span>
                <input placeholder="Enter the rep's home or route start address" value={state.routeStartAddress} onChange={(event) => setState((current) => ({ ...current, routeStartAddress: event.target.value }))} />
              </label>
              <input placeholder="Lat" type="number" step="0.000001" value={state.routeStartLat ?? ""} onChange={(event) => setState((current) => ({ ...current, routeStartLat: event.target.value === "" ? undefined : Number(event.target.value) }))} />
              <input placeholder="Lng" type="number" step="0.000001" value={state.routeStartLng ?? ""} onChange={(event) => setState((current) => ({ ...current, routeStartLng: event.target.value === "" ? undefined : Number(event.target.value) }))} />
            </div>
            <div className="non-field-form">
              <input type="date" value={newNonField.date} onChange={(event) => setNewNonField((current) => ({ ...current, date: event.target.value }))} />
              <select value={newNonField.type} onChange={(event) => setNewNonField((current) => ({ ...current, type: event.target.value as NonFieldDay["type"] }))}>
                <option>Leave</option>
                <option>Meeting</option>
                <option>Training</option>
                <option>Holiday</option>
                <option>Travel</option>
                <option>Sick</option>
              </select>
              <input placeholder="Reason" value={newNonField.reason} onChange={(event) => setNewNonField((current) => ({ ...current, reason: event.target.value }))} />
              <button className="button secondary" onClick={addNonFieldDay}><Plus size={16} /> Add</button>
            </div>
            <div className="blocked-list">
              {state.nonFieldDays.map((day) => (
                <div key={day.date}>
                  <span>{day.date}</span>
                  <strong>{day.type}</strong>
                  <em>{day.reason}</em>
                  <button className="icon-button" onClick={() => removeUnavailableDate(day.date)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </section>}

        {activeTab === "pharmacies" && (
          <section className="single-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="title-with-count"><h2>My pharmacies</h2><span>{activeAssignedCount} pharmacies in your territory</span></div>
                  <span>{filteredActiveCount !== activeAssignedCount ? `${filteredActiveCount} matching · ` : ""}Add, organise and review the pharmacies included in your monthly visit plan.</span>
                </div>
                <div className="actions">
                  <label className="button secondary" title="Import pharmacies">
                    <FileUp size={16} /> Import pharmacies
                    <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleImport} />
                  </label>
                  <button className="button primary" onClick={() => setDirectoryOpen(true)}><Plus size={16} /> Add pharmacies</button>
                </div>
              </div>

              {state.accounts.length === 0 ? (
                <div className="onboarding-state">
                  <strong>{demoMode ? "Set up your Western Cape territory" : "No pharmacies added yet"}</strong>
                  <span>{demoMode ? "Load a sample pharmacy territory or choose pharmacies from the directory to build your first monthly plan." : "Add pharmacies from the Western Cape directory to start building your monthly visit plan."}</span>
                  <div className="actions">
                    {demoMode && <button className="button primary" onClick={loadSampleTerritory}>Load sample territory</button>}
                    <button className="button secondary" onClick={() => setDirectoryOpen(true)}>Choose pharmacies</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="filter-row">
                    <input placeholder="Search my pharmacies" aria-label="Search my pharmacies" value={pharmacySearch} onChange={(event) => setPharmacySearch(event.target.value)} />
                    <select aria-label="Area filter" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">All areas</option>{areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}</select>
                    <select aria-label="Grade filter" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="all">All grades</option><option>A</option><option>B</option><option>C</option></select>
                    <select aria-label="Active filter" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}><option value="active">Active pharmacies</option><option value="archived">Archived pharmacies</option><option value="all">All pharmacies</option></select>
                    {pharmacySearch && <button className="button secondary" onClick={() => setPharmacySearch("")}>Clear</button>}
                  </div>
                  <div className="table-wrap tall">
                    <table>
                      <thead>
                        <tr><th>Pharmacy</th><th>Area</th><th>Grade</th><th>Address</th><th>Location</th><th>Required</th><th>Status</th><th></th></tr>
                      </thead>
                      <tbody>
                        {filteredCompliance.length === 0 && <tr><td colSpan={8}><div className="empty-state">No pharmacies match your search.</div></td></tr>}
                        {filteredCompliance.map((row) => (
                          <tr key={row.account.id}>
                            <td><strong>{row.account.name}</strong><span>{row.account.practiceNumber ? `Practice ${row.account.practiceNumber}` : row.account.telephone ?? ""}</span></td>
                            <td>{row.account.area}</td>
                            <td>{row.account.grade}</td>
                            <td>{row.account.address || "Not provided"}</td>
                            <td>{row.account.lat !== undefined && row.account.lng !== undefined ? <><strong>{row.account.coordinateConfidence ?? "Located"}</strong><span>{row.account.locationPrecision === "town" ? "Not the precise entrance" : ""}</span></> : <span>Needs location review</span>}</td>
                            <td>{row.required}</td>
                            <td><StatusPill status={row.status} /></td>
                            <td><button className="icon-button" onClick={() => removeAccount(row.account)} title="Remove pharmacy"><Trash2 size={15} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {activeTab === "pharmacies" && (
          <section className="territory-grid section-gap">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Territory map</h2>
                  <span>See the pharmacies assigned to your territory and where they are located.</span>
                </div>
              </div>
              <TerritoryMap accounts={filteredCompliance.map((row) => row.account)} compliance={filteredCompliance} />
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Area summary</h2>
                  <span>Review the number of pharmacies and required visits in each area.</span>
                </div>
              </div>
              <AreaSummary accounts={filteredCompliance.map((row) => row.account)} compliance={filteredCompliance} />
            </div>
          </section>
        )}

        {directoryOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="directory-modal">
              <div className="panel-header">
                <div>
                  <h2>Add pharmacies</h2>
                  <span>Search the Western Cape directory by name, practice number, town, suburb or address.</span>
                </div>
                <button className="button secondary" onClick={() => setDirectoryOpen(false)}>Close</button>
              </div>
              <div className="filter-row">
                <input autoFocus placeholder="Search directory" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} />
                <button className="button primary" onClick={addSelectedDirectoryPharmacies} disabled={!selectedDirectoryIds.length}>Add selected</button>
              </div>
              {directoryQuery.trim().length < 2 && <div className="empty-state">Enter at least two characters to search the directory.</div>}
              {directoryBusy && <div className="empty-state">Searching directory...</div>}
              {directoryError && <div className="notice bad">{directoryError}</div>}
              {!directoryBusy && directoryQuery.trim().length >= 2 && !directoryError && directoryResults.length === 0 && <div className="empty-state">No directory pharmacies match that search. Try a pharmacy name, practice number, town or suburb.</div>}
              <div className="directory-results">
                {directoryResults.map((row) => {
                  const alreadyAdded = assignedDirectoryIds.has(row.id) || (row.practice_number ? assignedPracticeNumbers.has(row.practice_number) : false);
                  const selected = selectedDirectoryIds.includes(row.id);
                  return (
                    <label key={row.id} className={`directory-row ${alreadyAdded ? "disabled" : ""}`}>
                      <input type="checkbox" checked={selected || alreadyAdded} disabled={alreadyAdded} onChange={(event) => setSelectedDirectoryIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
                      <div>
                        <strong>{row.practice_name}</strong>
                        <span>{row.practice_number ? `Practice ${row.practice_number} · ` : ""}{row.suburb || row.town || "Western Cape"}</span>
                        <small>{row.physical_address || "Address not provided"}{row.telephone ? ` · ${row.telephone}` : ""}</small>
                      </div>
                      {alreadyAdded && <em>Already added</em>}
                    </label>
                  );
                })}
              </div>
              <button className="button secondary" onClick={() => setImportNotice({ tone: "warn", message: "Manual pharmacy capture is available through the import workflow for this demo." })}>Add manually</button>
            </div>
          </div>
        )}

        {activeTab === "availability" && (
          <section className="single-grid">
            <div className="panel settings-panel">
              <div className="panel-header">
                <div>
                  <h2>Availability</h2>
                  <span>Working days and month-specific unavailable dates.</span>
                </div>
              </div>
              <div className="readiness-strip">
                <Metric label="Eligible field days" value={String(availableDays.length)} detail={`${state.nonFieldDays.length} unavailable dates`} tone="neutral" />
                <Metric label="Available capacity" value={String(metrics.capacity)} detail={`Max ${state.dailyCapacity} visits per day`} tone={metrics.capacity >= metrics.required ? "good" : "warn"} />
                <Metric label="Blocked conflicts" value={String(metrics.blockedVisits)} detail="Planned visits on unavailable dates" tone={metrics.blockedVisits ? "bad" : "good"} />
              </div>
              <div className="non-field-form">
                <input type="date" value={newNonField.date} onChange={(event) => setNewNonField((current) => ({ ...current, date: event.target.value }))} />
                <select value={newNonField.type} onChange={(event) => setNewNonField((current) => ({ ...current, type: event.target.value as NonFieldDay["type"] }))}>
                  <option>Leave</option>
                  <option>Meeting</option>
                  <option>Training</option>
                  <option>Holiday</option>
                  <option>Travel</option>
                  <option>Sick</option>
                </select>
                <input placeholder="Reason" value={newNonField.reason} onChange={(event) => setNewNonField((current) => ({ ...current, reason: event.target.value }))} />
                <button className="button secondary" onClick={addNonFieldDay}><Plus size={16} /> Add unavailable date</button>
              </div>
              <div className="blocked-list">
                {state.nonFieldDays.map((day) => (
                  <div key={day.date}>
                    <span>{day.date}</span>
                    <strong>{day.type}</strong>
                    <em>{day.reason}</em>
                    <button className="icon-button" onClick={() => removeUnavailableDate(day.date)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="single-grid">
            <div className="panel settings-panel">
              <div className="panel-header">
                <div>
                  <h2>Planning defaults</h2>
                  <span>Frequency, daily capacity, route start and planning defaults.</span>
                </div>
              </div>
              {supabaseConfig.configured && (
                <div className="demo-tools">
                  <button className="button secondary" onClick={importLegacyLocalState}>Import existing demo data</button>
                  {demoMode && <button className="button secondary" onClick={resetSample}>Load demo pharmacies</button>}
                </div>
              )}
              <RulesEditor
                gradeRules={state.gradeRules}
                nonFieldDays={state.nonFieldDays}
                newNonField={newNonField}
                setNewNonField={setNewNonField}
                updateRule={updateRule}
                minDailyCalls={state.minDailyCalls}
                dailyCapacity={state.dailyCapacity}
                cycleStartDay={state.cycleStartDay}
                routeStartAddress={state.routeStartAddress}
                routeStartLat={state.routeStartLat}
                routeStartLng={state.routeStartLng}
                updatePlannerSettings={(patch) => setState((current) => ({ ...current, ...patch, visits: patch.cycleStartDay !== undefined ? [] : current.visits }))}
                addNonFieldDay={addNonFieldDay}
                resetSample={resetSample}
                removeNonFieldDay={removeUnavailableDate}
              />
            </div>
          </section>
        )}

        {activeTab === "team" && (
          <section className="manager-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Team overview</h2>
                  <span>Representative planning readiness for the selected cycle.</span>
                </div>
              </div>
              <div className="manager-cards">
                <Metric label="Rep plan" value={state.visits.length ? "Submitted" : "Not planned"} detail={`${metrics.planned}/${metrics.required} visits planned`} tone={state.visits.length ? "good" : "warn"} />
                <Metric label="Planning reminder" value={planningStatus(allDays, state.managerPlanningDueDays, state.visits.length)} detail={`${state.managerPlanningDueDays} days before cycle end`} tone={state.visits.length ? "good" : "warn"} />
                <Metric label="Route quality" value={`${metrics.overloadDays} overload`} detail={`${metrics.underloadDays} under minimum`} tone={metrics.overloadDays ? "bad" : metrics.underloadDays ? "warn" : "good"} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Rep</th><th>Cycle</th><th>CPA plan</th><th>Compliance</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Demo rep</strong><span>{state.routeStartAddress || "Home address not set"}</span></td>
                      <td>{allDays[0]} to {allDays[allDays.length - 1]}</td>
                      <td>{metrics.planned}/{metrics.required}</td>
                      <td>{metrics.complianceRate}%</td>
                      <td><StatusPill status={state.visits.length ? "Compliant" : "At risk"} /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel settings-panel">
              <div className="panel-header">
                <div>
                  <h2>Add team event</h2>
                  <span>Block a date and replan affected future visits.</span>
                </div>
              </div>
              <div className="non-field-form">
                <input type="date" value={state.managerTrainingDate} onChange={(event) => setState((current) => ({ ...current, managerTrainingDate: event.target.value }))} />
                <input placeholder="Event reason" value={state.managerNotice} onChange={(event) => setState((current) => ({ ...current, managerNotice: event.target.value }))} />
                <button className="button primary" onClick={addManagerTrainingDay}>Block date</button>
              </div>
              <div className="rule-list">
                <label className="rule-row">Plan due<input type="number" min="1" value={state.managerPlanningDueDays} onChange={(event) => setState((current) => ({ ...current, managerPlanningDueDays: Number(event.target.value) }))} /><span>days before end</span></label>
              </div>
              <div className="empty-state">Team planning will appear after representatives are assigned to this manager.</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

type PlannerSettingsPatch = Partial<Pick<PersistedState, "minDailyCalls" | "dailyCapacity" | "cycleStartDay" | "routeStartAddress" | "routeStartLat" | "routeStartLng">>;

type RulesEditorProps = {
  gradeRules: GradeRules;
  nonFieldDays: NonFieldDay[];
  newNonField: NonFieldDay;
  setNewNonField: Dispatch<SetStateAction<NonFieldDay>>;
  updateRule: (grade: string, value: number) => void;
  minDailyCalls: number;
  dailyCapacity: number;
  cycleStartDay: number;
  routeStartAddress: string;
  routeStartLat?: number;
  routeStartLng?: number;
  updatePlannerSettings: (patch: PlannerSettingsPatch) => void;
  addNonFieldDay: () => void;
  resetSample: () => void;
  removeNonFieldDay: (date: string) => void;
};

function RulesEditor({
  gradeRules,
  nonFieldDays,
  newNonField,
  setNewNonField,
  updateRule,
  minDailyCalls,
  dailyCapacity,
  cycleStartDay,
  routeStartAddress,
  routeStartLat,
  routeStartLng,
  updatePlannerSettings,
  addNonFieldDay,
  resetSample,
  removeNonFieldDay,
}: RulesEditorProps) {
  return (
    <>
      <div className="rule-list">
        {Object.keys(gradeRules).sort().map((grade) => (
          <label key={grade} className="rule-row">Grade {grade}<input type="number" min="0" value={gradeRules[grade]} onChange={(event) => updateRule(grade, Number(event.target.value))} /><span>visits/mo</span></label>
        ))}
        <label className="rule-row">Min visits/day<input type="number" min="0" max={dailyCapacity} value={minDailyCalls} onChange={(event) => updatePlannerSettings({ minDailyCalls: Number(event.target.value) })} /><span>visits</span></label>
        <label className="rule-row">Max visits/day<input type="number" min="1" value={dailyCapacity} onChange={(event) => updatePlannerSettings({ dailyCapacity: Number(event.target.value), minDailyCalls: Math.min(minDailyCalls, Number(event.target.value)) })} /><span>visits</span></label>
        <label className="rule-row">Cycle start<input type="number" min="1" max="28" value={cycleStartDay} onChange={(event) => updatePlannerSettings({ cycleStartDay: Number(event.target.value) })} /><span>day</span></label>
        <button className="button secondary full" onClick={resetSample}><Users size={16} /> Load demo pharmacies</button>
      </div>
      <div className="route-start">
        <label>
          <span>Rep home address</span>
          <input placeholder="Enter the rep's home or route start address" value={routeStartAddress} onChange={(event) => updatePlannerSettings({ routeStartAddress: event.target.value })} />
        </label>
        <input placeholder="Lat" type="number" step="0.000001" value={routeStartLat ?? ""} onChange={(event) => updatePlannerSettings({ routeStartLat: event.target.value === "" ? undefined : Number(event.target.value) })} />
        <input placeholder="Lng" type="number" step="0.000001" value={routeStartLng ?? ""} onChange={(event) => updatePlannerSettings({ routeStartLng: event.target.value === "" ? undefined : Number(event.target.value) })} />
      </div>
      <div className="non-field-form">
        <input type="date" value={newNonField.date} onChange={(event) => setNewNonField((current) => ({ ...current, date: event.target.value }))} />
        <select value={newNonField.type} onChange={(event) => setNewNonField((current) => ({ ...current, type: event.target.value as NonFieldDay["type"] }))}>
          <option>Leave</option>
          <option>Meeting</option>
          <option>Training</option>
          <option>Holiday</option>
          <option>Travel</option>
          <option>Sick</option>
        </select>
        <input placeholder="Reason" value={newNonField.reason} onChange={(event) => setNewNonField((current) => ({ ...current, reason: event.target.value }))} />
        <button className="button secondary" onClick={addNonFieldDay}><Plus size={16} /> Add</button>
      </div>
      <div className="blocked-list">
        {nonFieldDays.map((day) => (
          <div key={day.date}>
            <span>{day.date}</span>
            <strong>{day.type}</strong>
            <em>{day.reason}</em>
            <button className="icon-button" onClick={() => removeNonFieldDay(day.date)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

function ToastStack({ notifications, onDismiss }: { notifications: ToastNotification[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" aria-label="Notifications">
      {notifications.map((notification) => <ToastItem key={notification.id} notification={notification} onDismiss={onDismiss} />)}
    </div>
  );
}

function ToastItem({ notification, onDismiss }: { notification: ToastNotification; onDismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const remainingMs = useRef(notification.durationMs ?? null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    remainingMs.current = notification.durationMs ?? null;
  }, [notification.durationMs, notification.id]);

  useEffect(() => {
    if (paused || remainingMs.current === null) return undefined;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => onDismiss(notification.id), remainingMs.current);
    return () => {
      window.clearTimeout(timer);
      if (startedAt.current !== null) {
        remainingMs.current = Math.max(0, (remainingMs.current ?? 0) - (Date.now() - startedAt.current));
      }
    };
  }, [notification.id, onDismiss, paused]);

  const role = notification.type === "error" ? "alert" : "status";
  return (
    <div
      className={`toast ${notification.type}`}
      role={role}
      aria-live={notification.type === "error" ? "assertive" : "polite"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div>
        {notification.title && <strong>{notification.title}</strong>}
        <span>{notification.message}</span>
        {notification.action && <button className="toast-action" onClick={notification.action.onClick}>{notification.action.label}</button>}
      </div>
      <button className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(notification.id)}><X size={15} /></button>
    </div>
  );
}

function planningStatus(days: string[], dueDays: number, plannedVisits: number) {
  if (plannedVisits > 0) return "On track";
  if (days.length === 0) return "No cycle";
  const end = new Date(`${days[days.length - 1]}T12:00:00`);
  const due = new Date(end);
  due.setDate(end.getDate() - dueDays);
  const today = new Date();
  return today >= due ? "Due now" : `Due ${dayLabel(dateKey(due))}`;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? AlertTriangle : tone === "warn" ? MoveRight : Gauge;
  return (
    <div className={`metric ${tone}`}>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
      <Icon size={20} />
    </div>
  );
}

function StatusPill({ status }: { status: ComplianceRow["status"] }) {
  return <span className={`status-pill ${status.toLowerCase().replace(" ", "-")}`}>{status}</span>;
}

function FitMapBounds({ accounts }: { accounts: Account[] }) {
  const map = useMap();
  useEffect(() => {
    const locatable = accounts.filter((account) => account.lat !== undefined && account.lng !== undefined);
    if (!locatable.length) {
      map.setView([-33.9, 19.2], 7);
      return;
    }
    const bounds = locatable.map((account) => [account.lat!, account.lng!] as [number, number]);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }, [accounts, map]);
  return null;
}

function TerritoryMap({ accounts, compliance }: { accounts: Account[]; compliance: ComplianceRow[] }) {
  const complianceById = new Map(compliance.map((row) => [row.account.id, row]));
  const withCoords = accounts.filter((account) => account.lat !== undefined && account.lng !== undefined);

  if (!accounts.length) {
    return <div className="map-empty-state"><MapPin size={20} /><strong>Add pharmacies to your territory to display them on the map.</strong></div>;
  }

  return (
    <div className="leaflet-shell">
      <MapContainer center={[-33.9, 19.2]} zoom={7} scrollWheelZoom={false} className="territory-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitMapBounds accounts={withCoords} />
        {withCoords.map((account) => {
          const row = complianceById.get(account.id);
          const approximate = account.locationPrecision === "town" || account.coordinateConfidence?.toLowerCase().includes("approximate");
          return (
            <CircleMarker key={account.id} center={[account.lat!, account.lng!]} radius={7} pathOptions={{ color: approximate ? "#b7791f" : "#0f766e", fillColor: approximate ? "#f6ad55" : "#14b8a6", fillOpacity: 0.85, weight: 2 }}>
              <Popup>
                <div className="map-popup">
                  <strong>{account.name}</strong>
                  <span>{account.practiceNumber ? `Practice ${account.practiceNumber}` : account.telephone ?? ""}</span>
                  <span>{account.area}{account.address ? ` · ${account.address}` : ""}</span>
                  <span>Grade {account.grade} · {row?.required ?? 0} required visits</span>
                  {approximate && <em>Approximate town location</em>}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {withCoords.length < accounts.length && <div className="map-note">{accounts.length - withCoords.length} pharmacies need a reviewed location before they can appear on the map.</div>}
    </div>
  );
}

function AreaSummary({ accounts, compliance, compact = false }: { accounts: Account[]; compliance: ComplianceRow[]; compact?: boolean }) {
  const complianceById = new Map(compliance.map((row) => [row.account.id, row]));
  const rows = Array.from(accounts.reduce((map, account) => {
    const current = map.get(account.area) ?? { area: account.area, accounts: 0, required: 0, planned: 0, grades: { A: 0, B: 0, C: 0 } as Record<string, number> };
    const row = complianceById.get(account.id);
    current.accounts += 1;
    current.required += row?.required ?? 0;
    current.planned += row?.planned ?? 0;
    current.grades[account.grade] = (current.grades[account.grade] ?? 0) + 1;
    map.set(account.area, current);
    return map;
  }, new Map<string, { area: string; accounts: number; required: number; planned: number; grades: Record<string, number> }>()).values())
    .sort((a, b) => b.required - a.required || b.accounts - a.accounts || a.area.localeCompare(b.area));

  if (!rows.length) return <div className="empty-state">Area totals will appear after pharmacies are added to your territory.</div>;

  return (
    <div className={compact ? "area-list compact" : "area-list"}>
      {rows.map((row) => {
        const rate = row.required ? Math.min(100, Math.round((row.planned / row.required) * 100)) : 100;
        const gradeText = Object.entries(row.grades).filter(([, count]) => count > 0).map(([grade, count]) => `${grade}: ${count}`).join(" · ");
        return (
          <div key={row.area} className="area-row">
            <div>
              <strong>{row.area}</strong>
              <span>{row.accounts} pharmacies · {gradeText}</span>
            </div>
            <div className="area-meter">
              <span>{row.planned}/{row.required} visits</span>
              <div><i style={{ width: `${rate}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default App;
