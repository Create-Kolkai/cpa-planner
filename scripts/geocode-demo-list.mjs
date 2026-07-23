import fs from "node:fs/promises";

const INPUT = "public/demo-list.csv";
const CACHE_PATH = "public/geocode-cache.json";
const USER_AGENT = "CPAPlannerDemo/0.1 create@kolkai.co.za";

const areaCoordinates = {
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

function parseDelimited(text) {
  return text.trim().split(/\r?\n/).map((line) => {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ";" && !quoted) {
        cells.push(cell);
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells;
  });
}

function serializeDelimited(rows) {
  return rows
    .map((row) => row.map((value) => {
      const text = String(value ?? "");
      return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    }).join(";"))
    .join("\n") + "\n";
}

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function cleanName(name) {
  return name
    .replace(/\bPHARMACY\b/gi, "")
    .replace(/\bPHARM\b/gi, "")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryVariants(row) {
  const name = row.name;
  const cleaned = cleanName(name);
  const brandBranch = cleaned
    .replace(/^DIS-CHEM\s+/i, "Dis-Chem ")
    .replace(/^CLICKS\s+/i, "Clicks ");
  const area = row.area || row.brick;
  const town = row.town || "Cape Town";
  const location = `${area}, ${town}, Western Cape, South Africa`;
  return Array.from(new Set([
    `${name}, ${location}`,
    `${brandBranch}, ${location}`,
    `${cleaned}, ${location}`,
    `${name}, Western Cape, South Africa`,
    `${brandBranch}, Western Cape, South Africa`,
  ].filter(Boolean)));
}

function distanceKm(a, b) {
  if (!a || !b) return 999;
  const earthRadius = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function scoreCandidate(row, candidate) {
  const display = normalize(candidate.display_name);
  const name = normalize(row.name);
  const cleaned = normalize(cleanName(row.name));
  const area = normalize(row.area || row.brick);
  const branchWords = cleaned.split(/\s+/).filter((word) => word.length >= 4 && !["PHARMACY", "PHARM", "CLICKS", "DIS-CHEM", "DISCHEM"].includes(word));
  let score = 0;
  if (display.includes("PHARMACY") || display.includes("CHEMIST") || display.includes("APTEEK")) score += 30;
  if (display.includes("CLICKS") && name.includes("CLICKS")) score += 28;
  if ((display.includes("DIS-CHEM") || display.includes("DISCHEM")) && (name.includes("DIS-CHEM") || name.includes("DISCHEM"))) score += 28;
  if (display.includes("CAPE TOWN") || display.includes("CITY OF CAPE TOWN")) score += 8;
  if (area && display.includes(area)) score += 14;
  branchWords.forEach((word) => {
    if (display.includes(word)) score += 10;
  });
  const areaPoint = areaCoordinates[area];
  const candidatePoint = { lat: Number(candidate.lat), lng: Number(candidate.lon) };
  const km = distanceKm(areaPoint, candidatePoint);
  if (km <= 3) score += 22;
  else if (km <= 8) score += 14;
  else if (km <= 18) score += 4;
  else score -= Math.min(40, Math.round(km));
  if (candidate.category === "amenity" && candidate.type === "pharmacy") score += 25;
  if (candidate.category === "shop" || candidate.category === "amenity") score += 6;
  return { score, km };
}

async function search(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "za");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function fallback(row) {
  const area = normalize(row.area || row.brick);
  const point = areaCoordinates[area];
  if (!point) return { lat: "", lng: "", source: "Missing", confidence: "Needs review", match: "No public geocode or area coordinate" };
  return {
    lat: point.lat.toFixed(6),
    lng: point.lng.toFixed(6),
    source: "Area estimate",
    confidence: "Area-level",
    match: `${row.area || row.brick} centroid`,
  };
}

async function geocodeRow(row, cache) {
  if (cache[row.code]) return cache[row.code];
  let best = null;
  for (const query of queryVariants(row)) {
    const candidates = await search(query);
    for (const candidate of candidates) {
      const scored = scoreCandidate(row, candidate);
      if (!best || scored.score > best.score) best = { ...scored, candidate, query };
    }
    await new Promise((resolve) => setTimeout(resolve, 1150));
  }
  if (!best || best.score < 42) {
    const value = { ...fallback(row), query: best?.query ?? "", score: best?.score ?? 0 };
    cache[row.code] = value;
    return value;
  }
  const confidence = best.score >= 80 ? "High" : best.score >= 60 ? "Medium" : "Low";
  const source = best.candidate.category === "amenity" && best.candidate.type === "pharmacy" ? "OSM pharmacy" : "OSM place";
  const value = {
    lat: Number(best.candidate.lat).toFixed(6),
    lng: Number(best.candidate.lon).toFixed(6),
    source,
    confidence,
    match: best.candidate.display_name,
    query: best.query,
    score: best.score,
    areaDistanceKm: Number(best.km.toFixed(1)),
  };
  cache[row.code] = value;
  return value;
}

const text = await fs.readFile(INPUT, "utf8");
const rows = parseDelimited(text);
let headers = rows[0].map((header) => header.trim());
const sourceHeaders = ["Latitude", "Longitude", "Coordinate Source", "Coordinate Confidence", "Coordinate Match"];
const keepIndexes = headers.map((header, index) => sourceHeaders.includes(header) ? -1 : index).filter((index) => index >= 0);
headers = keepIndexes.map((index) => headers[index]);
const compactRows = rows.slice(1).map((row) => keepIndexes.map((index) => row[index] ?? ""));
const index = (name) => headers.indexOf(name);
const cache = await loadCache();
const outputRows = [headers.concat(sourceHeaders)];
const summary = { High: 0, Medium: 0, Low: 0, "Area-level": 0, "Needs review": 0 };

for (let i = 0; i < compactRows.length; i += 1) {
  const row = compactRows[i];
  const record = {
    name: row[index("Customer Name")] ?? "",
    code: row[index("Customer Code")] ?? "",
    brick: row[index("Brick Name")] ?? "",
    town: row[index("Town / City")] ?? "",
    area: row[index("Suburb Name")] ?? "",
  };
  const coordinates = await geocodeRow(record, cache);
  summary[coordinates.confidence] = (summary[coordinates.confidence] ?? 0) + 1;
  outputRows.push(row.concat([coordinates.lat, coordinates.lng, coordinates.source, coordinates.confidence, coordinates.match]));
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  console.log(`${String(i + 1).padStart(2, "0")}/${compactRows.length} ${record.name} -> ${coordinates.confidence} ${coordinates.lat},${coordinates.lng}`);
}

await fs.writeFile(INPUT, serializeDelimited(outputRows));
console.log(JSON.stringify(summary, null, 2));
