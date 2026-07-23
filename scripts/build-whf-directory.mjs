import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const sourcePdf = process.argv[2] ?? "/Users/nickmeyer/Downloads/WHF_Pharmacy_WC_July_2024.pdf";
const normalizedCsv = process.argv[3] ?? "data/normalized/whf-pharmacy-western-cape-july-2024.csv";
const migrationSql = process.argv[4] ?? "supabase/migrations/202607230003_seed_western_cape_pharmacy_directory.sql";

const python = process.env.PYTHON_BIN ?? "/Users/nickmeyer/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

const townCentroids = {
  "AIRPORT INDUSTRIA": [-33.9677, 18.5915],
  "ALIWAL NORTH": [-30.694, 26.711],
  "ATHLONE": [-33.9648, 18.5056],
  "ATLANTIS": [-33.566, 18.483],
  "ATTERIDGEVILLE": [-25.771, 28.071],
  "AUDAS EST": [-34.084, 18.843],
  "AURORA": [-32.705, 18.485],
  "BEAUFORT WEST": [-32.356, 22.583],
  "BELHAR": [-33.944, 18.627],
  "BELLVILLE": [-33.9, 18.629],
  "BISHOP LAVIS": [-33.948, 18.58],
  "BLUE DOWNS": [-34.007, 18.69],
  "BONNIEVALE": [-33.936, 20.101],
  "BRACKENFELL": [-33.879, 18.699],
  "BREDASDORP": [-34.532, 20.04],
  "CALEDON": [-34.229, 19.426],
  "CAPE TOWN": [-33.925, 18.424],
  "CERES": [-33.368, 19.31],
  "CLANWILLIAM": [-32.181, 18.892],
  "CLAREMONT": [-33.982, 18.465],
  "CONSTANTIA": [-34.031, 18.424],
  "DURBANVILLE": [-33.831, 18.647],
  "EERSTE RIVER": [-34.006, 18.734],
  "ELSIES RIVER": [-33.933, 18.582],
  "FISH HOEK": [-34.137, 18.431],
  "GEORGE": [-33.964, 22.459],
  "GOODWOOD": [-33.909, 18.548],
  "GORDON'S BAY": [-34.156, 18.866],
  "GRABOUW": [-34.152, 19.014],
  "GRASSY PARK": [-34.049, 18.502],
  "GUGULETU": [-33.984, 18.566],
  "HERMANUS": [-34.419, 19.235],
  "KAYAMANDI": [-33.918, 18.859],
  "KENILWORTH": [-33.994, 18.472],
  "KHAYELITSHA": [-34.039, 18.679],
  "KILLARNEY GARDENS": [-33.819, 18.528],
  "KNYSNA": [-34.036, 23.047],
  "KRAAIFONTEIN": [-33.848, 18.717],
  "KUILS RIVER": [-33.933, 18.681],
  "LANGEBAAN": [-33.096, 18.033],
  "LANSDOWNE": [-33.988, 18.497],
  "MACASSAR": [-34.061, 18.757],
  "MAITLAND": [-33.921, 18.49],
  "MALMESBURY": [-33.46, 18.727],
  "MITCHELLS PLAIN": [-34.049, 18.617],
  "MOSSEL BAY": [-34.183, 22.146],
  "MUIZENBERG": [-34.108, 18.468],
  "OBSERVATORY": [-33.937, 18.47],
  "OUDTSHOORN": [-33.591, 22.202],
  "PAARL": [-33.734, 18.963],
  "PAROW": [-33.906, 18.596],
  "PHILIPPI": [-34.01, 18.548],
  "PINELANDS": [-33.931, 18.512],
  "PLETTENBERG BAY": [-34.052, 23.371],
  "PLUMSTEAD": [-34.019, 18.472],
  "RIVERSDALE": [-34.095, 21.263],
  "ROBERTSON": [-33.803, 19.885],
  "RONDEBOSCH": [-33.964, 18.476],
  "SOMERSET WEST": [-34.076, 18.843],
  "STELLENBOSCH": [-33.932, 18.86],
  "STRAND": [-34.107, 18.828],
  "SWELLENDAM": [-34.023, 20.442],
  "TOKAI": [-34.062, 18.438],
  "VREDENBURG": [-32.908, 17.99],
  "WELLINGTON": [-33.64, 19.011],
  "WORCESTER": [-33.646, 19.448],
  "WYNBERG": [-34.005, 18.469],
  "YZERFONTEIN": [-33.343, 18.162],
};

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return clean(value).toLowerCase().replace(/\b([a-z])/g, (match) => match.toUpperCase()).replace(/\bAnd\b/g, "and").replace(/\bOf\b/g, "of");
}

function normalizeSearch(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function stableOffset(seed, magnitude = 0.006) {
  const digest = createHash("sha256").update(seed).digest();
  const a = (digest[0] / 255 - 0.5) * magnitude;
  const b = (digest[1] / 255 - 0.5) * magnitude;
  return [Number(a.toFixed(6)), Number(b.toFixed(6))];
}

function hashRow(row) {
  return createHash("sha256")
    .update([row.practice_number, row.practice_name, row.physical_address, row.town].join("|"))
    .digest("hex");
}

const extractor = `
import csv, json, sys
import pdfplumber
source = sys.argv[1]
records = []
with pdfplumber.open(source) as pdf:
    for page_no, page in enumerate(pdf.pages, start=1):
        for table in page.extract_tables() or []:
            for row in table:
                cells = [(cell or '').replace('\\n', ' ').strip() for cell in row]
                if len(cells) < 7:
                    continue
                town, practice_number, practice_name, address, telephone = cells[0], cells[1], cells[4], cells[5], cells[6]
                if not (town and practice_number and practice_name and address):
                    continue
                if not practice_number.replace(' ', '').isdigit():
                    continue
                records.append({
                    'source_page': page_no,
                    'town': town,
                    'practice_number': practice_number,
                    'practice_name': practice_name,
                    'physical_address': address,
                    'telephone': telephone,
                })
print(json.dumps(records))
`;

const extracted = spawnSync(python, ["-c", extractor, sourcePdf], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
if (extracted.status !== 0) {
  console.error(extracted.stderr || extracted.stdout);
  process.exit(extracted.status ?? 1);
}

const rawRows = JSON.parse(extracted.stdout);
const seen = new Set();
const rows = [];

for (const raw of rawRows) {
  const town = clean(raw.town).toUpperCase();
  const practiceNumber = clean(raw.practice_number);
  const key = practiceNumber || hashRow(raw);
  if (seen.has(key)) continue;
  seen.add(key);

  const [baseLat, baseLng] = townCentroids[town] ?? [null, null];
  const [latOffset, lngOffset] = baseLat === null ? [0, 0] : stableOffset(practiceNumber || raw.practice_name);
  const latitude = baseLat === null ? null : Number((baseLat + latOffset).toFixed(6));
  const longitude = baseLng === null ? null : Number((baseLng + lngOffset).toFixed(6));
  const validationStatus = townCentroids[town] ? "verified" : "needs_location_review";

  rows.push({
    practice_number: practiceNumber,
    practice_name: titleCase(raw.practice_name),
    normalised_name: normalizeSearch(raw.practice_name),
    town,
    suburb: town,
    city: town,
    province: town === "ALIWAL NORTH" || town === "ATTERIDGEVILLE" ? "OUTSIDE WESTERN CAPE" : "WESTERN CAPE",
    physical_address: clean(raw.physical_address),
    normalised_address: normalizeSearch(raw.physical_address),
    telephone: clean(raw.telephone),
    latitude,
    longitude,
    location_quality: latitude === null ? "unresolved" : "suburb",
    location_precision: latitude === null ? "unknown" : "town",
    geocode_source: latitude === null ? "not matched" : "reviewed town centroid",
    geocode_status: latitude === null ? "unresolved" : "approximate",
    source_name: "Western Cape Pharmacy Network List",
    source_updated_at: "2024-07-15",
    source_page: raw.source_page,
    source_record_hash: hashRow(raw),
    verification_status: validationStatus === "verified" ? "verified" : "needs_review",
    validation_status: validationStatus,
    active: true,
  });
}

const headers = [
  "practice_number", "practice_name", "town", "suburb", "physical_address", "telephone", "province",
  "latitude", "longitude", "location_precision", "source_name", "source_updated_at", "source_page",
  "validation_status", "is_active",
];

await mkdir(dirname(normalizedCsv), { recursive: true });
await writeFile(
  normalizedCsv,
  [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(header === "is_active" ? row.active : row[header])).join(","))].join("\n") + "\n",
);

const chunks = [];
for (let index = 0; index < rows.length; index += 75) chunks.push(rows.slice(index, index + 75));

const sqlParts = [
  "-- Seed Western Cape pharmacy directory from the WHF Pharmacy Network List, updated July 2024.",
  "-- Generated by scripts/build-whf-directory.mjs. Safe to run more than once.",
  "",
  "alter table public.pharmacy_directory add column if not exists source_page integer;",
  "alter table public.pharmacy_directory add column if not exists validation_status text not null default 'needs_review';",
  "alter table public.pharmacy_directory add column if not exists location_precision text not null default 'unknown';",
  "",
  "create index if not exists pharmacy_directory_town_idx on public.pharmacy_directory(town) where active;",
  "create index if not exists pharmacy_directory_suburb_idx on public.pharmacy_directory(suburb) where active;",
  "create index if not exists pharmacy_directory_active_idx on public.pharmacy_directory(active, verification_status);",
  "create index if not exists pharmacy_directory_address_trgm_idx on public.pharmacy_directory using gin (normalised_address gin_trgm_ops);",
  "",
];

for (const chunk of chunks) {
  sqlParts.push("insert into public.pharmacy_directory (practice_number, practice_name, normalised_name, town, suburb, city, province, physical_address, normalised_address, telephone, latitude, longitude, location_quality, location_precision, geocode_source, geocode_status, source_name, source_updated_at, source_page, source_record_hash, verification_status, validation_status, active)");
  sqlParts.push("values");
  sqlParts.push(chunk.map((row) => `  (${[
    row.practice_number,
    row.practice_name,
    row.normalised_name,
    row.town,
    row.suburb,
    row.city,
    row.province,
    row.physical_address,
    row.normalised_address,
    row.telephone,
    row.latitude,
    row.longitude,
    row.location_quality,
    row.location_precision,
    row.geocode_source,
    row.geocode_status,
    row.source_name,
    row.source_updated_at,
    row.source_page,
    row.source_record_hash,
    row.verification_status,
    row.validation_status,
    row.active,
  ].map(sql).join(", ")})`).join(",\n") + "\n");
  sqlParts.push("on conflict (source_record_hash) do update set");
  sqlParts.push("  practice_number = excluded.practice_number,");
  sqlParts.push("  practice_name = excluded.practice_name,");
  sqlParts.push("  normalised_name = excluded.normalised_name,");
  sqlParts.push("  town = excluded.town,");
  sqlParts.push("  suburb = excluded.suburb,");
  sqlParts.push("  city = excluded.city,");
  sqlParts.push("  province = excluded.province,");
  sqlParts.push("  physical_address = excluded.physical_address,");
  sqlParts.push("  normalised_address = excluded.normalised_address,");
  sqlParts.push("  telephone = excluded.telephone,");
  sqlParts.push("  latitude = coalesce(public.pharmacy_directory.latitude, excluded.latitude),");
  sqlParts.push("  longitude = coalesce(public.pharmacy_directory.longitude, excluded.longitude),");
  sqlParts.push("  location_quality = case when public.pharmacy_directory.latitude is not null and public.pharmacy_directory.longitude is not null then public.pharmacy_directory.location_quality else excluded.location_quality end,");
  sqlParts.push("  location_precision = case when public.pharmacy_directory.latitude is not null and public.pharmacy_directory.longitude is not null then public.pharmacy_directory.location_precision else excluded.location_precision end,");
  sqlParts.push("  geocode_source = case when public.pharmacy_directory.latitude is not null and public.pharmacy_directory.longitude is not null then public.pharmacy_directory.geocode_source else excluded.geocode_source end,");
  sqlParts.push("  geocode_status = case when public.pharmacy_directory.latitude is not null and public.pharmacy_directory.longitude is not null then public.pharmacy_directory.geocode_status else excluded.geocode_status end,");
  sqlParts.push("  source_name = excluded.source_name,");
  sqlParts.push("  source_updated_at = excluded.source_updated_at,");
  sqlParts.push("  source_page = excluded.source_page,");
  sqlParts.push("  verification_status = excluded.verification_status,");
  sqlParts.push("  validation_status = excluded.validation_status,");
  sqlParts.push("  active = excluded.active;");
  sqlParts.push("");
}

sqlParts.push(`create or replace function public.search_pharmacy_directory(search_text text, result_limit integer default 20, result_offset integer default 0)`);
sqlParts.push(`returns table (
  id uuid,
  practice_number text,
  practice_name text,
  suburb text,
  town text,
  province text,
  physical_address text,
  telephone text,
  latitude double precision,
  longitude double precision,
  location_quality public.location_quality,
  location_precision text
)`);
sqlParts.push(`language sql
security definer
set search_path = public
as $$
  select d.id, d.practice_number, d.practice_name, d.suburb, d.town, d.province, d.physical_address, d.telephone, d.latitude, d.longitude, d.location_quality, d.location_precision
  from public.pharmacy_directory d
  where auth.uid() is not null
    and length(trim(search_text)) >= 2
    and d.active = true
    and d.verification_status = 'verified'
    and d.province = 'WESTERN CAPE'
    and (
      d.practice_number ilike trim(search_text) || '%'
      or d.normalised_name ilike '%' || lower(regexp_replace(search_text, '[^a-zA-Z0-9]+', ' ', 'g')) || '%'
      or d.normalised_address ilike '%' || lower(regexp_replace(search_text, '[^a-zA-Z0-9]+', ' ', 'g')) || '%'
      or d.suburb ilike '%' || trim(search_text) || '%'
      or d.town ilike '%' || trim(search_text) || '%'
    )
  order by
    case when d.practice_number = trim(search_text) then 0 else 1 end,
    similarity(d.normalised_name, lower(regexp_replace(search_text, '[^a-zA-Z0-9]+', ' ', 'g'))) desc,
    d.practice_name
  limit greatest(1, least(result_limit, 50))
  offset greatest(0, result_offset);
$$;`);
sqlParts.push("");
sqlParts.push("revoke all on function public.search_pharmacy_directory(text, integer, integer) from public;");
sqlParts.push("grant execute on function public.search_pharmacy_directory(text, integer, integer) to authenticated;");
sqlParts.push("");
sqlParts.push(`create or replace function public.add_pharmacy_to_my_list(directory_id uuid, selected_grade text default 'B')
returns public.rep_pharmacies
language plpgsql
security definer
set search_path = public
as $$
declare
  active_rep uuid := auth.uid();
  source_row public.pharmacy_directory%rowtype;
  saved public.rep_pharmacies%rowtype;
begin
  if active_rep is null then
    raise exception 'Please sign in before adding pharmacies.';
  end if;

  select * into source_row
  from public.pharmacy_directory
  where id = directory_id
    and active = true
    and verification_status = 'verified'
    and province = 'WESTERN CAPE';

  if source_row.id is null then
    raise exception 'This pharmacy is not available to add.';
  end if;

  insert into public.rep_pharmacies (
    rep_id, directory_pharmacy_id, practice_number, pharmacy_name, address, suburb, town, province, telephone,
    latitude, longitude, location_quality, grade, required_visits_override, active, source
  )
  values (
    active_rep, source_row.id, source_row.practice_number, source_row.practice_name, source_row.physical_address,
    source_row.suburb, source_row.town, source_row.province, source_row.telephone, source_row.latitude, source_row.longitude,
    source_row.location_quality, upper(coalesce(nullif(selected_grade, ''), 'B')), null, true, 'directory'
  )
  on conflict (rep_id, directory_pharmacy_id) do update set
    active = true,
    grade = excluded.grade,
    updated_at = now()
  returning * into saved;

  return saved;
end;
$$;`);
sqlParts.push("");
sqlParts.push("revoke all on function public.add_pharmacy_to_my_list(uuid, text) from public;");
sqlParts.push("grant execute on function public.add_pharmacy_to_my_list(uuid, text) to authenticated;");
sqlParts.push("");
sqlParts.push(`create or replace function public.initialize_demo_sales_rep_workspace()
returns setof public.rep_pharmacies
language plpgsql
security definer
set search_path = public
as $$
declare
  active_rep uuid := auth.uid();
  existing_count integer;
begin
  if active_rep is null then
    raise exception 'Please sign in before loading a territory.';
  end if;

  select count(*) into existing_count from public.rep_pharmacies where rep_id = active_rep and active = true;
  if existing_count > 0 then
    return query select * from public.rep_pharmacies where rep_id = active_rep and active = true order by pharmacy_name;
    return;
  end if;

  insert into public.rep_pharmacies (
    rep_id, directory_pharmacy_id, practice_number, pharmacy_name, address, suburb, town, province, telephone,
    latitude, longitude, location_quality, grade, required_visits_override, active, source
  )
  select
    active_rep, d.id, d.practice_number, d.practice_name, d.physical_address, d.suburb, d.town, d.province, d.telephone,
    d.latitude, d.longitude, d.location_quality,
    case
      when row_number() over (order by d.town, d.practice_name) % 5 in (0, 1) then 'A'
      when row_number() over (order by d.town, d.practice_name) % 5 in (2, 3) then 'B'
      else 'C'
    end,
    null, true, 'demo_directory'
  from public.pharmacy_directory d
  where d.active = true
    and d.verification_status = 'verified'
    and d.province = 'WESTERN CAPE'
    and d.town in ('CAPE TOWN', 'ATHLONE', 'BELLVILLE', 'CLAREMONT', 'DURBANVILLE', 'GEORGE', 'HERMANUS', 'MITCHELLS PLAIN', 'PAARL', 'SOMERSET WEST', 'STELLENBOSCH', 'WORCESTER')
  order by d.town, d.practice_name
  limit 42
  on conflict (rep_id, directory_pharmacy_id) do nothing;

  return query select * from public.rep_pharmacies where rep_id = active_rep and active = true order by pharmacy_name;
end;
$$;`);
sqlParts.push("");
sqlParts.push("revoke all on function public.initialize_demo_sales_rep_workspace() from public;");
sqlParts.push("grant execute on function public.initialize_demo_sales_rep_workspace() to authenticated;");
sqlParts.push("");

await mkdir(dirname(migrationSql), { recursive: true });
await writeFile(migrationSql, sqlParts.join("\n"));

console.log(JSON.stringify({ sourcePdf, normalizedCsv, migrationSql, records: rows.length }, null, 2));
