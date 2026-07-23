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

console.log("Planner scenario tests passed");
