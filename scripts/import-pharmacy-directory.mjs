import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sourcePath = process.argv[2] ?? "public/demo-list.csv";
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this server-only import.");
  process.exit(1);
}

function parseCsvLine(line, delimiter) {
  const cells = [];
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

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceHash(row) {
  return createHash("sha256")
    .update([row.practice_number, row.practice_name, row.physical_address, row.suburb, row.town].join("|"))
    .digest("hex");
}

const raw = await readFile(sourcePath, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);
const delimiter = lines[0].includes(";") ? ";" : ",";
const headers = parseCsvLine(lines[0], delimiter).map(normalize);
const indexOf = (...names) => names.map(normalize).map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;

const nameIndex = indexOf("practice name", "account name", "name");
const practiceIndex = indexOf("practice number", "customer code", "account code");
const addressIndex = indexOf("physical address", "address");
const suburbIndex = indexOf("suburb name", "suburb", "brick name", "area");
const townIndex = indexOf("town", "town city", "city");
const provinceIndex = indexOf("province");
const telephoneIndex = indexOf("telephone", "phone");
const latIndex = indexOf("latitude", "lat");
const lngIndex = indexOf("longitude", "lng", "lon");
const qualityIndex = indexOf("coordinate confidence", "location quality");
const sourceIndex = indexOf("coordinate source", "geocode source");

if (nameIndex < 0) {
  console.error("No pharmacy/practice name column found.");
  process.exit(1);
}

const seen = new Set();
const rows = [];
let duplicateRows = 0;
let invalidRows = 0;

for (const line of lines.slice(1)) {
  const cells = parseCsvLine(line, delimiter);
  const practice_name = cells[nameIndex];
  if (!practice_name) {
    invalidRows += 1;
    continue;
  }
  const row = {
    practice_number: cells[practiceIndex] || null,
    practice_name,
    normalised_name: normalize(practice_name),
    town: cells[townIndex] || null,
    suburb: cells[suburbIndex] || null,
    city: cells[townIndex] || null,
    province: cells[provinceIndex] || "WESTERN CAPE",
    physical_address: cells[addressIndex] || null,
    normalised_address: normalize(cells[addressIndex] || [cells[suburbIndex], cells[townIndex], cells[provinceIndex]].filter(Boolean).join(", ")),
    telephone: cells[telephoneIndex] || null,
    latitude: Number.isFinite(Number(cells[latIndex])) ? Number(cells[latIndex]) : null,
    longitude: Number.isFinite(Number(cells[lngIndex])) ? Number(cells[lngIndex]) : null,
    location_quality: cells[qualityIndex]?.toLowerCase().includes("area") ? "area_estimate" : Number.isFinite(Number(cells[latIndex])) ? "place" : "unresolved",
    geocode_source: cells[sourceIndex] || "demo-list",
    geocode_status: cells[latIndex] && cells[lngIndex] ? "matched" : "unresolved",
    source_name: sourcePath,
    source_updated_at: new Date().toISOString().slice(0, 10),
    verification_status: "verified",
    active: true,
  };
  row.source_record_hash = sourceHash(row);
  const duplicateKey = row.practice_number || row.source_record_hash;
  if (seen.has(duplicateKey)) {
    duplicateRows += 1;
    continue;
  }
  seen.add(duplicateKey);
  rows.push(row);
}

const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/pharmacy_directory?on_conflict=source_record_hash`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}

console.log(JSON.stringify({
  sourcePath,
  upserted: rows.length,
  duplicateRows,
  invalidRows,
}, null, 2));
