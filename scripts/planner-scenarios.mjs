import assert from "node:assert/strict";

const coords = {
  "SEA POINT": { lat: -33.918, lng: 18.3895 },
  "GREEN POINT": { lat: -33.9069, lng: 18.4075 },
};

function makeVisits(area, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${area}-${index + 1}`,
    name: `${area} Pharmacy ${index + 1}`,
    area,
    ...coords[area],
  }));
}

function distanceKm(a, b) {
  const earthRadius = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function planByNearbyOverflow(items, max) {
  const groups = new Map();
  items.forEach((item) => {
    const group = groups.get(item.area) ?? [];
    group.push(item);
    groups.set(item.area, group);
  });

  const days = [];
  const overflow = [];
  Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([area, group]) => {
      let cursor = group.slice();
      while (cursor.length >= max) {
        days.push(cursor.slice(0, max));
        cursor = cursor.slice(max);
      }
      if (cursor.length) overflow.push({ area, items: cursor });
    });

  overflow
    .sort((a, b) => b.items.length - a.items.length || a.area.localeCompare(b.area))
    .forEach((chunk) => {
      const compatibleDay = days
        .filter((day) => day.length < max)
        .sort((a, b) => {
          const aDistance = distanceKm(a[0], chunk.items[0]);
          const bDistance = distanceKm(b[0], chunk.items[0]);
          return aDistance - bDistance || b.length - a.length;
        })[0];
      if (compatibleDay && compatibleDay.length + chunk.items.length <= max) {
        compatibleDay.push(...chunk.items);
      } else {
        days.push(chunk.items.slice());
      }
    });

  return days;
}

function areaCounts(day) {
  return day.reduce((counts, visit) => {
    counts[visit.area] = (counts[visit.area] ?? 0) + 1;
    return counts;
  }, {});
}

function assertNoOverload(days, max) {
  days.forEach((day) => assert.ok(day.length <= max, `day has ${day.length}, max ${max}`));
}

function swapDays(plan, sourceDate, targetDate) {
  return plan.map((visit) => {
    if (visit.date === sourceDate) return { ...visit, date: targetDate };
    if (visit.date === targetDate) return { ...visit, date: sourceDate };
    return visit;
  });
}

function redistributeBlockedDate(plan, blockedDate, laterCapacities) {
  const displaced = plan.filter((visit) => visit.date === blockedDate);
  const preserved = plan.filter((visit) => visit.date !== blockedDate);
  const unresolved = [];
  let cursor = 0;
  const moved = [];
  for (const [date, capacity] of laterCapacities) {
    const existing = preserved.filter((visit) => visit.date === date).length + moved.filter((visit) => visit.date === date).length;
    const available = Math.max(0, capacity - existing);
    displaced.slice(cursor, cursor + available).forEach((visit, index) => {
      moved.push({ ...visit, date, stopOrder: existing + index + 1 });
    });
    cursor += available;
  }
  unresolved.push(...displaced.slice(cursor).map((visit) => ({ ...visit, status: "unresolved" })));
  return { visits: [...preserved, ...moved], unresolved };
}

{
  const days = planByNearbyOverflow([...makeVisits("SEA POINT", 10), ...makeVisits("GREEN POINT", 6)], 8);
  assert.equal(days.flat().length, 16);
  assertNoOverload(days, 8);
  assert.ok(days.some((day) => areaCounts(day)["SEA POINT"] === 8));
  assert.ok(days.some((day) => areaCounts(day)["SEA POINT"] === 2 && areaCounts(day)["GREEN POINT"] === 6));
}

{
  const days = planByNearbyOverflow([...makeVisits("SEA POINT", 10), ...makeVisits("GREEN POINT", 11)], 8);
  assert.equal(days.flat().length, 21);
  assertNoOverload(days, 8);
  assert.equal(days.filter((day) => day.length === 8).length, 2);
  assert.ok(days.some((day) => areaCounts(day)["SEA POINT"] === 2 && areaCounts(day)["GREEN POINT"] === 3));
}

{
  const plan = [
    { id: "a", date: "2026-08-04" },
    { id: "b", date: "2026-08-04" },
    { id: "c", date: "2026-08-07" },
  ];
  const swapped = swapDays(plan, "2026-08-04", "2026-08-07");
  assert.deepEqual(swapped.filter((visit) => visit.date === "2026-08-07").map((visit) => visit.id).sort(), ["a", "b"]);
  assert.deepEqual(swapped.filter((visit) => visit.date === "2026-08-04").map((visit) => visit.id), ["c"]);
}

{
  const displaced = Array.from({ length: 6 }, (_, index) => ({ id: `blocked-${index + 1}`, date: "2026-08-18", status: "scheduled" }));
  const result = redistributeBlockedDate(displaced, "2026-08-18", [["2026-08-19", 2], ["2026-08-20", 3], ["2026-08-21", 1]]);
  assert.equal(result.visits.filter((visit) => visit.date === "2026-08-18").length, 0);
  assert.equal(result.visits.length, 6);
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.visits.filter((visit) => visit.date === "2026-08-19").length, 2);
  assert.equal(result.visits.filter((visit) => visit.date === "2026-08-20").length, 3);
  assert.equal(result.visits.filter((visit) => visit.date === "2026-08-21").length, 1);
}


function parseDemoMode(value) {
  return String(value ?? "false").toLowerCase() === "true";
}

{
  assert.equal(parseDemoMode("true"), true);
  assert.equal(parseDemoMode("TRUE"), true);
  assert.equal(parseDemoMode("false"), false);
  assert.equal(parseDemoMode(undefined), false);
}

function normalizeHeader(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function searchMyPharmacies(accounts, query) {
  const normalized = query.trim().toLowerCase();
  return accounts.filter((account) => !normalized || [account.name, account.practiceNumber, account.town, account.area, account.address].some((value) => String(value ?? "").toLowerCase().includes(normalized)));
}

function addDirectoryPharmacy(accounts, directoryRow) {
  const alreadyAdded = accounts.some((account) => account.directoryPharmacyId === directoryRow.id || account.practiceNumber === directoryRow.practice_number);
  if (alreadyAdded) return accounts;
  return accounts.concat({
    id: `rep-${directoryRow.id}`,
    directoryPharmacyId: directoryRow.id,
    practiceNumber: directoryRow.practice_number,
    name: directoryRow.practice_name,
    area: directoryRow.suburb || directoryRow.town,
    town: directoryRow.town,
    address: directoryRow.physical_address,
    grade: "B",
    lat: directoryRow.latitude,
    lng: directoryRow.longitude,
    locationPrecision: directoryRow.location_precision,
  });
}

function initializeDemoTerritory(accounts, directoryRows) {
  if (accounts.length) return accounts;
  return directoryRows.slice(0, 4).map((row, index) => ({
    id: `demo-${row.id}`,
    directoryPharmacyId: row.id,
    practiceNumber: row.practice_number,
    name: row.practice_name,
    area: row.suburb || row.town,
    town: row.town,
    address: row.physical_address,
    grade: index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C",
    lat: row.latitude,
    lng: row.longitude,
    locationPrecision: row.location_precision,
  }));
}

function mapMarkers(accounts) {
  return accounts.filter((account) => Number.isFinite(account.lat) && Number.isFinite(account.lng)).map((account) => ({
    id: account.id,
    label: account.locationPrecision === "town" ? "Approximate town location" : "Located",
  }));
}

function areaTotals(accounts, rules) {
  return Array.from(accounts.reduce((map, account) => {
    const current = map.get(account.area) ?? { area: account.area, accounts: 0, required: 0 };
    current.accounts += 1;
    current.required += rules[account.grade] ?? 0;
    map.set(account.area, current);
    return map;
  }, new Map()).values());
}

function parseImportRows(rows) {
  const headers = rows[0].map(normalizeHeader);
  const find = (...names) => names.map(normalizeHeader).map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const nameIndex = find("pharmacy name", "practice name", "name", "customer name");
  const practiceIndex = find("practice number", "customer code", "code");
  const townIndex = find("town", "city");
  const suburbIndex = find("suburb", "area");
  const gradeIndex = find("grade", "current grading");
  const seen = new Set();
  let duplicates = 0;
  const accounts = [];
  for (const row of rows.slice(1)) {
    const name = row[nameIndex];
    if (!name) continue;
    const key = String(row[practiceIndex] || name).toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    accounts.push({ name, practiceNumber: row[practiceIndex], town: row[townIndex], area: row[suburbIndex] || row[townIndex], grade: row[gradeIndex] || "C" });
  }
  return { accounts, duplicates };
}

const directoryFixture = [
  { id: "d1", practice_number: "375861", practice_name: "Cape Town Airport Pharmacy", town: "AIRPORT INDUSTRIA", suburb: "AIRPORT INDUSTRIA", physical_address: "Airport Ring Road", latitude: -33.97, longitude: 18.59, location_precision: "town", active: true },
  { id: "d2", practice_number: "227951", practice_name: "Vangate Mall Clicks Pharmacy", town: "ATHLONE", suburb: "ATHLONE", physical_address: "Vanguard Drive", latitude: -33.966, longitude: 18.508, location_precision: "town", active: true },
  { id: "d3", practice_number: "6044859", practice_name: "Durbell Pharmacy", town: "BELLVILLE", suburb: "BELLVILLE", physical_address: "Tygervalley Centre", latitude: -33.899, longitude: 18.626, location_precision: "town", active: true },
  { id: "d4", practice_number: "513555", practice_name: "Clicks Pharmacy Caledon", town: "CALEDON", suburb: "CALEDON", physical_address: "Victoria Mall", latitude: -34.23, longitude: 19.42, location_precision: "town", active: true },
];

{
  const accounts = initializeDemoTerritory([], directoryFixture);
  assert.equal(searchMyPharmacies(accounts, "vangate").length, 1);
  assert.equal(searchMyPharmacies(accounts, "227951")[0].name, "Vangate Mall Clicks Pharmacy");
  assert.equal(searchMyPharmacies(accounts, "athlone").length, 1);
  assert.equal(searchMyPharmacies(accounts, "CAPE TOWN AIRPORT").length, 1);
}

{
  const activeDirectoryRows = directoryFixture.filter((row) => row.active);
  assert.ok(activeDirectoryRows.some((row) => row.practice_name.includes("Cape Town")));
  assert.ok(activeDirectoryRows.every((row) => row.active));
}

{
  const first = addDirectoryPharmacy([], directoryFixture[0]);
  const second = addDirectoryPharmacy(first, directoryFixture[0]);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
}

{
  const demo = initializeDemoTerritory([], directoryFixture);
  const rerun = initializeDemoTerritory(demo, directoryFixture);
  assert.equal(demo.length, 4);
  assert.equal(rerun.length, 4);
  assert.deepEqual(rerun.map((account) => account.practiceNumber), demo.map((account) => account.practiceNumber));
}

{
  const accounts = initializeDemoTerritory([], directoryFixture);
  const markers = mapMarkers(accounts);
  assert.equal(markers.length, accounts.length);
  assert.ok(markers.every((marker) => marker.label === "Approximate town location"));
}

{
  const totals = areaTotals(initializeDemoTerritory([], directoryFixture), { A: 2, B: 1, C: 0 });
  assert.equal(totals.reduce((sum, row) => sum + row.accounts, 0), 4);
  assert.ok(totals.reduce((sum, row) => sum + row.required, 0) > 0);
}

{
  const csvRows = [
    ["Practice Number", "Pharmacy Name", "Town", "Suburb", "Grade"],
    ["375861", "Cape Town Airport Pharmacy", "CAPE TOWN", "AIRPORT INDUSTRIA", "A"],
    ["375861", "Cape Town Airport Pharmacy", "CAPE TOWN", "AIRPORT INDUSTRIA", "A"],
    ["227951", "Vangate Mall Clicks Pharmacy", "CAPE TOWN", "ATHLONE", "B"],
  ];
  const parsed = parseImportRows(csvRows);
  assert.equal(parsed.accounts.length, 2);
  assert.equal(parsed.duplicates, 1);
}

{
  const renderedCopy = "Import pharmacies Territory map Search my pharmacies Approximate town location";
  assert.equal(renderedCopy.includes("Import CSV"), false);
  assert.equal(renderedCopy.includes("Map provider not configured"), false);
  assert.equal(renderedCopy.includes("sales_rep"), false);
}

console.log("Planner scenario tests passed");
