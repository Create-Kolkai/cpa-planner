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

console.log("Planner scenario tests passed");
