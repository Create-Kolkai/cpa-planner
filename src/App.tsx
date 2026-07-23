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
} from "lucide-react";
import { ChangeEvent, Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";

type TabKey = "overview" | "pharmacies" | "monthly-plan" | "availability" | "team" | "settings";
type GradeRules = Record<string, number>;

type Account = {
  id: string;
  name: string;
  address: string;
  area: string;
  grade: string;
  lat?: number;
  lng?: number;
  coordinateSource?: string;
  coordinateConfidence?: string;
  coordinateMatch?: string;
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

const STORAGE_KEY = "cpa-planner-state-v6";
const DEMO_LIST_URL = "/demo-list.csv";

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

function distanceKm(a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }) {
  if (a?.lat === undefined || a.lng === undefined || b?.lat === undefined || b.lng === undefined) return 35;
  const earthRadius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeRegion(area: string) {
  const normalized = normalizeArea(area);
  if (["WATERFRONT", "GREEN POINT", "SEA POINT", "CAPE TOWN", "FORESHORE", "GARDENS"].includes(normalized)) return "01 Atlantic CBD";
  if (["OBSERVATORY", "MAITLAND", "PINELANDS", "RONDEBOSCH", "KENILWORTH", "LANSDOWNE", "ATHLONE", "GATESVILLE"].includes(normalized)) return "02 Inner Southern";
  if (["PLUMSTEAD", "OTTERY", "TOKAI", "MUIZENBERG", "SUN VALLEY", "SIMON'S TOWN", "GRASSY PARK", "PELICAN PARK"].includes(normalized)) return "03 Southern Peninsula";
  if (["AIRPORT INDUSTRIA", "CHARLESVILLE", "ELSIES RIVER", "BELHAR", "DELFT", "GUGULETU", "PHILIPPI", "MITCHELLS PLAIN", "LENTEGEUR", "MAKHAZA", "KHAYELITSHA", "MFULENI"].includes(normalized)) return "04 Cape Flats";
  if (["EERSTE RIVER", "FAURE", "MACASSAR", "SOMERSET WEST", "HELDERBERG", "STRAND", "GORDON'S BAY"].includes(normalized)) return "05 Helderberg";
  if (["HERMANUS", "SANDBAAI", "CALEDON", "BREDASDORP", "SWELLENDAM"].includes(normalized)) return "06 Overberg";
  return "07 Other";
}

function routeClusterKey(chunk: { region: string; lat?: number; lng?: number; area: string }) {
  if (chunk.lat === undefined || chunk.lng === undefined) return `${chunk.region}:${chunk.area}`;
  const lat = Math.round(chunk.lat / 0.09) * 0.09;
  const lng = Math.round(chunk.lng / 0.09) * 0.09;
  return `${chunk.region}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

function generatePlan(accounts: Account[], rules: GradeRules, month: string, nonFieldDays: NonFieldDay[], capacity: number, minDailyCalls: number, cycleStartDay: number, startPoint?: { lat?: number; lng?: number }) {
  const availableDays = fieldDays(month, nonFieldDays, cycleStartDay);
  const dailyCap = Math.max(1, Math.floor(capacity || 1));
  const dailyMin = Math.max(0, Math.min(dailyCap, Math.floor(minDailyCalls || 0)));
  const generated: Visit[] = [];
  if (availableDays.length === 0) return generated;

  const areaGroups = new Map<string, Account[]>();
  accounts.forEach((account) => {
    const group = areaGroups.get(account.area) ?? [];
    group.push(account);
    areaGroups.set(account.area, group);
  });

  type RouteItem = {
    account: Account;
    sequence: number;
    required: number;
  };

  type RouteChunk = {
    area: string;
    region: string;
    cluster: string;
    round: number;
    items: RouteItem[];
    lat?: number;
    lng?: number;
  };

  type DayRoute = {
    day: string;
    items: RouteItem[];
    areas: Set<string>;
    accountIds: Set<string>;
    region?: string;
    cluster?: string;
    lat?: number;
    lng?: number;
  };

  const chunks = Array.from(areaGroups.entries()).flatMap(([area, group]) => {
    const enrichedGroup = group
      .map((account) => ({ account, required: Math.max(0, Number(rules[account.grade] ?? 0)) }))
      .filter((item) => item.required > 0)
      .sort((a, b) => gradeSortValue(a.account.grade) - gradeSortValue(b.account.grade) || a.account.name.localeCompare(b.account.name));
    const maxRequired = Math.max(...enrichedGroup.map((item) => item.required), 0);
    const reference = enrichedGroup.find((item) => item.account.lat !== undefined && item.account.lng !== undefined)?.account;
    const areaChunks: RouteChunk[] = [];

    for (let round = 1; round <= maxRequired; round += 1) {
      const roundItems = enrichedGroup
        .filter((item) => item.required >= round)
        .map((item) => ({ account: item.account, sequence: round, required: item.required }));
      const chunkCount = Math.max(1, Math.ceil(roundItems.length / dailyCap));
      const chunkSize = Math.ceil(roundItems.length / chunkCount);

      for (let index = 0; index < roundItems.length; index += chunkSize) {
        const unit = {
          area,
          region: routeRegion(area),
          round,
          items: roundItems.slice(index, index + chunkSize),
          lat: reference?.lat,
          lng: reference?.lng,
        };
        areaChunks.push({ ...unit, cluster: routeClusterKey(unit) });
      }
    }

    return areaChunks;
  }).sort((a, b) => {
    const regionDelta = a.region.localeCompare(b.region);
    if (regionDelta) return regionDelta;
    if (a.round !== b.round) return a.round - b.round;
    if (a.lat !== undefined && b.lat !== undefined && Math.abs(a.lat - b.lat) > 0.035) return b.lat - a.lat;
    if (a.lng !== undefined && b.lng !== undefined) return a.lng - b.lng;
    return a.area.localeCompare(b.area);
  });

  const dayRoutes: DayRoute[] = availableDays.map((day) => ({
    day,
    items: [],
    areas: new Set<string>(),
    accountIds: new Set<string>(),
  }));

  const visitsByAccount = new Map<string, string[]>();
  const monthCapacity = availableDays.length * dailyCap;
  const requiredVisits = chunks.reduce((sum, chunk) => sum + chunk.items.length, 0);
  const infeasibleMonth = requiredVisits > monthCapacity;

  function minimumGap(item: RouteItem) {
    return Math.max(1, Math.floor(availableDays.length / Math.max(item.required, 1)) - 1);
  }

  function dayIndex(day: string) {
    return availableDays.indexOf(day);
  }

  function spacingPenalty(route: DayRoute, chunk: RouteChunk) {
    return chunk.items.reduce((sum, item) => {
      const existing = visitsByAccount.get(item.account.id) ?? [];
      if (existing.length === 0) return sum;
      const closestGap = Math.min(...existing.map((day) => Math.abs(dayIndex(route.day) - dayIndex(day))));
      return sum + Math.max(0, minimumGap(item) - closestGap) * 18;
    }, 0);
  }

  function routeDistance(route: DayRoute, chunk: RouteChunk) {
    if (route.items.length === 0) return 0;
    return distanceKm(route, chunk);
  }

  function chunkScore(route: DayRoute, chunk: RouteChunk) {
    const projectedLoad = route.items.length + chunk.items.length;
    const duplicateAccounts = chunk.items.some((item) => route.accountIds.has(item.account.id));
    const overload = Math.max(0, projectedLoad - dailyCap);
    const regionPenalty = route.region && route.region !== chunk.region ? 70 : 0;
    const clusterPenalty = route.cluster && route.cluster !== chunk.cluster ? 15000 : 0;
    const areaBonus = route.areas.has(chunk.area) ? -16 : 0;
    const emptyRoutePenalty = route.items.length === 0 ? 6 : 0;
    const startPenalty = route.items.length === 0 ? distanceKm(startPoint, chunk) * 0.45 : 0;
    const minBonus = route.items.length > 0 && route.items.length < dailyMin ? -45 : 0;
    const loadPenalty = route.items.length >= dailyMin ? (route.items.length / dailyCap) * 12 : route.items.length * 1.5;
    const hardLimitPenalty = !infeasibleMonth && overload > 0 ? 10000 : overload * 650;
    return hardLimitPenalty + (duplicateAccounts ? 10000 : 0) + clusterPenalty + regionPenalty + routeDistance(route, chunk) * 2.2 + startPenalty + spacingPenalty(route, chunk) + loadPenalty + emptyRoutePenalty + areaBonus + minBonus;
  }

  function placeChunk(chunk: RouteChunk) {
    const viableRoutes = dayRoutes.filter((route) => {
      const duplicateAccounts = chunk.items.some((item) => route.accountIds.has(item.account.id));
      const projectedLoad = route.items.length + chunk.items.length;
      return !duplicateAccounts && (infeasibleMonth || projectedLoad <= dailyCap);
    });
    const routePool = viableRoutes.length ? viableRoutes : dayRoutes;
    const sameClusterPool = routePool.filter((route) => !route.cluster || route.cluster === chunk.cluster);
    const sameRegionPool = routePool.filter((route) => !route.region || route.region === chunk.region);
    const bestRoute = (sameClusterPool.length ? sameClusterPool : sameRegionPool.length ? sameRegionPool : routePool)
      .slice()
      .sort((a, b) => chunkScore(a, chunk) - chunkScore(b, chunk))[0];
    if (!bestRoute) return;

    bestRoute.items.push(...chunk.items);
    bestRoute.areas.add(chunk.area);
    chunk.items.forEach((item) => bestRoute.accountIds.add(item.account.id));
    if (!bestRoute.region) bestRoute.region = chunk.region;
    if (!bestRoute.cluster) bestRoute.cluster = chunk.cluster;
    const positioned = bestRoute.items.map((item) => item.account).filter((account) => account.lat !== undefined && account.lng !== undefined);
    if (positioned.length) {
      bestRoute.lat = positioned.reduce((sum, account) => sum + account.lat!, 0) / positioned.length;
      bestRoute.lng = positioned.reduce((sum, account) => sum + account.lng!, 0) / positioned.length;
    }
    chunk.items.forEach((item) => {
      const dates = visitsByAccount.get(item.account.id) ?? [];
      dates.push(bestRoute.day);
      visitsByAccount.set(item.account.id, dates);
    });
  }

  chunks.forEach(placeChunk);

  dayRoutes.forEach((route) => {
    route.items
      .slice()
      .sort((a, b) => {
        const areaDelta = a.account.area.localeCompare(b.account.area);
        if (areaDelta) return areaDelta;
        return gradeSortValue(a.account.grade) - gradeSortValue(b.account.grade) || a.account.name.localeCompare(b.account.name);
      })
      .forEach((item) => {
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

function parseCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (lines.length < 2) return { accounts: [], warnings: ["The file needs a header row and at least one account row."] };

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((row) => parseCsvLine(row, delimiter));

  const headers = rows[0].map(normalizeHeader);
  const find = (...names: string[]) => {
    const normalizedNames = names.map(normalizeHeader);
    return normalizedNames.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  };
  const nameIndex = find("account name", "name", "account", "customer", "customer name", "practice", "practice name", "doctor", "hcp", "client");
  const addressIndex = find("address", "street", "physical address", "location");
  const areaIndex = find("suburb name", "brick name", "area", "suburb", "territory", "region", "town", "town city", "city");
  const townIndex = find("town city", "town", "city");
  const provinceIndex = find("province");
  const gradeIndex = find("current grading", "grade", "class", "tier", "segment", "priority", "category", "previous grading");
  const codeIndex = find("customer code", "account code", "code");
  const latIndex = find("lat", "latitude");
  const lngIndex = find("lng", "lon", "long", "longitude");
  const coordinateSourceIndex = find("coordinate source", "location source", "geocode source");
  const coordinateConfidenceIndex = find("coordinate confidence", "location confidence", "geocode confidence", "confidence");
  const coordinateMatchIndex = find("coordinate match", "matched address", "geocode match", "match");

  const warnings: string[] = [];
  if (nameIndex < 0) return { accounts: [], warnings: ["No account name column found. Use a header like Account Name, Name, Customer, Practice, Doctor, or HCP."] };
  if (gradeIndex < 0) warnings.push("No grade column found. Imported accounts were defaulted to Grade C.");
  if (areaIndex < 0) warnings.push("No area/suburb column found. Imported accounts were grouped as Unassigned.");
  const accounts = rows.slice(1).flatMap((row, index) => {
    const name = row[nameIndex];
    const grade = (row[gradeIndex] || "C").toUpperCase();
    if (!name || !grade) return [];
    const lat = Number(row[latIndex]);
    const lng = Number(row[lngIndex]);
    return enrichLocation({
      id: row[codeIndex] || `csv-${Date.now()}-${index}`,
      name,
      address: row[addressIndex] || [row[areaIndex], row[townIndex], row[provinceIndex]].filter(Boolean).join(", "),
      area: row[areaIndex] || "Unassigned",
      grade,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      coordinateSource: row[coordinateSourceIndex] || undefined,
      coordinateConfidence: row[coordinateConfidenceIndex] || undefined,
      coordinateMatch: row[coordinateMatchIndex] || undefined,
    });
  });

  if (accounts.length === 0) warnings.push("No usable account rows were found after reading the file.");
  const missingCoordinates = accounts.filter((account) => account.lat === undefined || account.lng === undefined).length;
  if (latIndex < 0 || lngIndex < 0) warnings.push("Coordinates were estimated from suburb and brick names for route grouping.");
  if (missingCoordinates > 0) warnings.push(`${missingCoordinates} pharmacies still need coordinates or a recognized area name.`);
  return { accounts, warnings };
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
  const [state, setState] = useState<PersistedState>(loadState);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [swapTargetDay, setSwapTargetDay] = useState<string>("");
  const [newNonField, setNewNonField] = useState({ date: `${state.month}-15`, type: "Leave" as NonFieldDay["type"], reason: "" });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (state.accounts.length === 0) loadDemoList("silent");
  }, [state.accounts.length]);

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

  const selectedVisits = visitsByDay.get(selectedDay) ?? [];
  const selectedAreas = Array.from(new Set(selectedVisits.map((visit) => accountById.get(visit.accountId)?.area).filter((area): area is string => Boolean(area))));
  const nonFieldSet = new Set(state.nonFieldDays.map((day) => day.date));
  const tabs: Array<{ key: TabKey; label: string; icon: typeof Gauge }> = [
    { key: "overview", label: "Overview", icon: Gauge },
    { key: "pharmacies", label: "Pharmacies", icon: Table2 },
    { key: "monthly-plan", label: "Monthly Plan", icon: CalendarDays },
    { key: "availability", label: "Availability", icon: CalendarDays },
    { key: "team", label: "Team", icon: Users },
    { key: "settings", label: "Settings", icon: Settings2 },
  ];

  function updateRule(grade: string, value: number) {
    setState((current) => ({ ...current, gradeRules: { ...current.gradeRules, [grade]: value } }));
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      importAccounts(text, file.name, "interactive");
    }).catch(() => {
      setImportNotice({ tone: "bad", message: "Import failed: the file could not be read by the browser." });
    });
    event.target.value = "";
  }

  function importAccounts(text: string, sourceName: string, mode: "silent" | "interactive" = "interactive") {
    const result = parseCsv(text);
    if (result.accounts.length) {
      const grades = new Set(result.accounts.map((account) => account.grade));
      const nextRules = { ...state.gradeRules };
      grades.forEach((grade) => {
        if (nextRules[grade] === undefined) nextRules[grade] = 1;
      });
      setState((current) => ({ ...current, accounts: result.accounts, gradeRules: nextRules, visits: [] }));
      setSelectedDay("");
      if (mode === "interactive") {
        setActiveTab("pharmacies");
        setImportNotice({
          tone: result.warnings.length ? "warn" : "good",
          message: `Imported ${result.accounts.length} pharmacies from ${sourceName}.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""}`,
        });
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
    setState((current) => ({
      ...current,
      nonFieldDays: [...current.nonFieldDays.filter((day) => day.date !== newNonField.date), { ...newNonField, reason: newNonField.reason.trim() }],
      visits: current.visits.filter((visit) => visit.date !== newNonField.date),
    }));
    setNewNonField((current) => ({ ...current, reason: "" }));
  }

  function moveVisit(visitId: string, date: string) {
    setState((current) => ({
      ...current,
      visits: current.visits.map((visit) => (visit.id === visitId ? { ...visit, date, locked: true } : visit)),
    }));
  }

  function removeVisit(visitId: string) {
    setState((current) => ({ ...current, visits: current.visits.filter((visit) => visit.id !== visitId) }));
  }

  function swapDayCalls(sourceDay: string, targetDay: string) {
    if (!sourceDay || !targetDay || sourceDay === targetDay) return;
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

  function resetSample() {
    loadDemoList("interactive");
  }

  function generate() {
    setState((current) => ({
      ...current,
      visits: generatePlan(
        current.accounts,
        current.gradeRules,
        current.month,
        current.nonFieldDays,
        current.dailyCapacity,
        current.minDailyCalls,
        current.cycleStartDay,
        { lat: current.routeStartLat, lng: current.routeStartLng },
      ),
    }));
    setImportNotice({ tone: "good", message: "Plan generated from the current pharmacies, grade rules, and unavailable dates." });
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
          {tabs.map((tab) => {
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
            <h1>{tabs.find((tab) => tab.key === activeTab)?.label ?? "CPA Planner"}</h1>
            <p>Persistent monthly visit planning demo · approximate route ordering until a route provider is configured</p>
          </div>
          <div className="actions">
            {activeTab === "pharmacies" && (
              <label className="button secondary" title="Import CSV">
                <FileUp size={16} /> Import CSV
                <input type="file" accept=".csv,.txt" onChange={handleImport} />
              </label>
            )}
            {activeTab === "monthly-plan" && state.visits.length > 0 && (
              <button className="button secondary" onClick={() => exportCalendarCsv(state.visits, state.accounts, allDays, state.nonFieldDays)}><Download size={16} /> Export calendar</button>
            )}
            {activeTab === "monthly-plan" && (
              <button className="button primary" onClick={generate}><Play size={16} /> {state.visits.length ? "Replan" : "Generate plan"}</button>
            )}
          </div>
        </header>

        {activeTab === "overview" && (
          <section className="metric-grid compact-three">
            <Metric label="Plan status" value={state.visits.length ? "Draft" : "Not planned"} detail={`${metrics.planned}/${metrics.required} required visits scheduled`} tone={state.visits.length && metrics.planned >= metrics.required ? "good" : "warn"} />
            <Metric label="Available capacity" value={String(metrics.capacity)} detail={`${availableDays.length} field days · max ${state.dailyCapacity}/day`} tone={metrics.capacity >= metrics.required ? "good" : "warn"} />
            <Metric label="Exceptions" value={String(metrics.overloadDays + metrics.underloadDays + metrics.blockedVisits)} detail={`${metrics.overloadDays} over max · ${metrics.underloadDays} under target · ${metrics.blockedVisits} blocked`} tone={metrics.overloadDays || metrics.blockedVisits ? "bad" : metrics.underloadDays ? "warn" : "good"} />
          </section>
        )}

        {importNotice && <div className={`notice ${importNotice.tone}`}>{importNotice.message}</div>}

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
                  <span>{state.accounts.filter((account) => account.coordinateConfidence === "Area-level" || account.lat === undefined || account.lng === undefined).length} pharmacies need better coordinates before route metrics can be exact.</span>
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
                <input aria-label="Planning month" type="month" value={state.month} onChange={(event) => setState((current) => ({ ...current, month: event.target.value, visits: [] }))} />
                <label>Cycle start <input type="number" min="1" max="28" value={state.cycleStartDay} onChange={(event) => setState((current) => ({ ...current, cycleStartDay: Number(event.target.value), visits: [] }))} /></label>
                <label>Min <input type="number" min="0" max={state.dailyCapacity} value={state.minDailyCalls} onChange={(event) => setState((current) => ({ ...current, minDailyCalls: Number(event.target.value) }))} /></label>
                <label>Max <input type="number" min="1" value={state.dailyCapacity} onChange={(event) => setState((current) => ({ ...current, dailyCapacity: Number(event.target.value), minDailyCalls: Math.min(current.minDailyCalls, Number(event.target.value)) }))} /></label>
              </div>
            </div>
            <div className="calendar-grid">
              {allDays.map((day) => {
                const count = visitsByDay.get(day)?.length ?? 0;
                const blocked = isWeekend(day) || nonFieldSet.has(day);
                const overload = count > state.dailyCapacity;
                const underload = !blocked && count > 0 && count < state.minDailyCalls;
                const isToday = day === todayKey();
                const blockedText = blockedLabel(day, state.nonFieldDays);
                return (
                  <button
                    key={day}
                    className={`day-cell ${selectedDay === day ? "selected" : ""} ${isToday ? "today" : ""} ${blocked ? "blocked" : ""} ${overload ? "overload" : ""} ${underload ? "underload" : ""}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span>{dayLabel(day)}</span>
                    <strong>{blocked ? blockedText : `${count} visits`}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel day-panel">
            <div className="panel-header">
              <div>
                <h2>{selectedDay || "Select a day"}</h2>
                <span>{selectedVisits.length} planned visits{selectedAreas.length ? ` · ${selectedAreas.slice(0, 3).join(", ")}${selectedAreas.length > 3 ? ` +${selectedAreas.length - 3}` : ""}` : ""}</span>
              </div>
              <div className="swap-tools">
                <select value={swapTargetDay} onChange={(event) => setSwapTargetDay(event.target.value)} title="Swap with day">
                  <option value="">Swap day</option>
                  {availableDays.filter((day) => day !== selectedDay).map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
                <button className="button secondary" onClick={() => swapDayCalls(selectedDay, swapTargetDay)} disabled={!swapTargetDay}>Swap</button>
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
                  <button className="icon-button" onClick={() => setState((current) => ({
                    ...current,
                    nonFieldDays: current.nonFieldDays.filter((item) => item.date !== day.date),
                    visits: current.visits.filter((visit) => visit.date !== day.date),
                  }))}><Trash2 size={14} /></button>
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
                  <h2>My pharmacies</h2>
                  <span>Client pharmacies used by the monthly visit planner.</span>
                </div>
                <div className="actions">
                  <label className="button secondary" title="Import CSV">
                    <FileUp size={16} /> Import CSV
                    <input type="file" accept=".csv,.txt" onChange={handleImport} />
                  </label>
                </div>
              </div>
              <div className="filter-row">
                <input placeholder="Search pharmacies" aria-label="Search pharmacies" />
                <select aria-label="Area filter"><option>All areas</option></select>
                <select aria-label="Grade filter"><option>All grades</option><option>A</option><option>B</option><option>C</option></select>
                <select aria-label="Active filter"><option>Active pharmacies</option><option>Archived pharmacies</option><option>All pharmacies</option></select>
                <button className="button secondary"><Plus size={16} /> Add pharmacy</button>
              </div>
              <div className="table-wrap tall">
                <table>
                  <thead>
                    <tr><th>Pharmacy</th><th>Area</th><th>Grade</th><th>Address</th><th>Location status</th><th>Required</th><th>Plan status</th></tr>
                  </thead>
                  <tbody>
                    {compliance.map((row) => (
                      <tr key={row.account.id}>
                        <td><strong>{row.account.name}</strong></td>
                        <td>{row.account.area}</td>
                        <td>{row.account.grade}</td>
                        <td>{row.account.address || "Not provided"}</td>
                        <td>
                          {row.account.lat !== undefined && row.account.lng !== undefined
                            ? <><strong>{row.account.coordinateConfidence === "Area-level" ? "Area estimate" : "Located"}</strong><span>{row.account.coordinateSource ?? "Location"} · details available in pharmacy record</span></>
                            : <StatusPill status="Missed" />}
                        </td>
                        <td>{row.required}</td>
                        <td><StatusPill status={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === "pharmacies" && (
          <section className="territory-grid section-gap">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Map</h2>
                  <span>Uses real coordinates only when a map provider is configured.</span>
                </div>
              </div>
              <TerritoryMap accounts={state.accounts} compliance={compliance} />
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Area summary</h2>
                  <span>Visit demand by suburb or brick.</span>
                </div>
              </div>
              <AreaSummary accounts={state.accounts} compliance={compliance} />
            </div>
          </section>
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
                    <button className="icon-button" onClick={() => setState((current) => ({
                      ...current,
                      nonFieldDays: current.nonFieldDays.filter((item) => item.date !== day.date),
                      visits: current.visits.filter((visit) => visit.date !== day.date),
                    }))}><Trash2 size={14} /></button>
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
                  <span>Frequency, capacity, route start, and demo workspace controls.</span>
                </div>
              </div>
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
                removeNonFieldDay={(date) => setState((current) => ({
                  ...current,
                  nonFieldDays: current.nonFieldDays.filter((item) => item.date !== date),
                  visits: current.visits.filter((visit) => visit.date !== date),
                }))}
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
              <div className="empty-state">Connect Supabase roles and team assignments to show all assigned representatives here.</div>
            </div>
          </section>
        )}
      </main>
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

function TerritoryMap({ accounts, compliance }: { accounts: Account[]; compliance: ComplianceRow[] }) {
  const withCoords = accounts.filter((account) => account.lat !== undefined && account.lng !== undefined);

  return (
    <div className="area-board">
      <div className="map-setup-state">
        <MapPin size={20} />
        <strong>Map provider not configured</strong>
        <span>{withCoords.length} pharmacies have coordinates for approximate route ordering. Add a route/map provider before displaying a basemap, route lines, driving distance, or driving time.</span>
      </div>
      <AreaSummary accounts={accounts} compliance={compliance} compact />
    </div>
  );
}

function AreaSummary({ accounts, compliance, compact = false }: { accounts: Account[]; compliance: ComplianceRow[]; compact?: boolean }) {
  const complianceById = new Map(compliance.map((row) => [row.account.id, row]));
  const rows = Array.from(accounts.reduce((map, account) => {
    const current = map.get(account.area) ?? { area: account.area, accounts: 0, required: 0, planned: 0 };
    const row = complianceById.get(account.id);
    current.accounts += 1;
    current.required += row?.required ?? 0;
    current.planned += row?.planned ?? 0;
    map.set(account.area, current);
    return map;
  }, new Map<string, { area: string; accounts: number; required: number; planned: number }>()).values())
    .sort((a, b) => b.required - a.required || a.area.localeCompare(b.area));

  return (
    <div className={compact ? "area-list compact" : "area-list"}>
      {rows.map((row) => {
        const rate = row.required ? Math.round((row.planned / row.required) * 100) : 0;
        return (
          <div key={row.area} className="area-row">
            <div>
              <strong>{row.area}</strong>
              <span>{row.accounts} pharmacies</span>
            </div>
            <div className="area-meter">
              <span>{row.planned}/{row.required}</span>
              <i><b style={{ width: `${Math.min(rate, 100)}%` }} /></i>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
}: {
  gradeRules: GradeRules;
  nonFieldDays: NonFieldDay[];
  newNonField: { date: string; type: NonFieldDay["type"]; reason: string };
  setNewNonField: Dispatch<SetStateAction<{ date: string; type: NonFieldDay["type"]; reason: string }>>;
  updateRule: (grade: string, value: number) => void;
  minDailyCalls: number;
  dailyCapacity: number;
  cycleStartDay: number;
  routeStartAddress: string;
  routeStartLat?: number;
  routeStartLng?: number;
  updatePlannerSettings: (patch: Partial<PersistedState>) => void;
  addNonFieldDay: () => void;
  resetSample: () => void;
  removeNonFieldDay: (date: string) => void;
}) {
  return (
    <>
      <div className="rule-list">
        {Object.keys(gradeRules).sort().map((grade) => (
          <label key={grade} className="rule-row">Grade {grade}<input type="number" min="0" value={gradeRules[grade]} onChange={(event) => updateRule(grade, Number(event.target.value))} /><span>visits/mo</span></label>
        ))}
        <label className="rule-row">Min visits/day<input type="number" min="0" max={dailyCapacity} value={minDailyCalls} onChange={(event) => updatePlannerSettings({ minDailyCalls: Number(event.target.value) })} /><span>visits</span></label>
        <label className="rule-row">Max visits/day<input type="number" min="1" value={dailyCapacity} onChange={(event) => updatePlannerSettings({ dailyCapacity: Number(event.target.value), minDailyCalls: Math.min(minDailyCalls, Number(event.target.value)) })} /><span>visits</span></label>
        <label className="rule-row">Cycle start<input type="number" min="1" max="28" value={cycleStartDay} onChange={(event) => updatePlannerSettings({ cycleStartDay: Number(event.target.value) })} /><span>day</span></label>
        <button className="button secondary full" onClick={resetSample}><Users size={16} /> Reset demo workspace</button>
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

export default App;
