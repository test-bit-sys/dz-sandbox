#!/usr/bin/env node
/**
 * Imports and Zod-validates Algerian wilayas and communes from `algeria-geo`
 * (`data/algeria-geo/` preferred, or fallback `algeria-geo-main/data/`) into
 * `packages/mock-yalidine/src/algeria-geo.generated.ts`.
 *
 * Intentionally strips latitude/longitude and GeoJSON boundaries so only
 * MIT / Official Gazette codes and AR/FR/EN administrative names are bundled.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

const RawWilayaSchema = z.object({
  code: z.string().regex(/^\d{2}$/, 'Wilaya code must be a 2-digit string'),
  name_ar: z.string().trim().min(1, 'name_ar must not be empty'),
  name_fr: z.string().trim().min(1, 'name_fr must not be empty'),
  name_en: z.string().trim().min(1).optional(),
  era: z.union([z.literal(48), z.literal(58), z.literal(69)]).default(69),
});

const RawCommuneSchema = z.object({
  code: z.string().regex(/^\d{4}$/, 'Commune code must be a 4-digit string'),
  wilaya_code: z.string().regex(/^\d{2}$/, 'wilaya_code must be a 2-digit string'),
  wilaya_code_58: z.string().regex(/^\d{2}$/).optional(),
  wilaya_code_48: z.string().regex(/^\d{2}$/).optional(),
  name_ar: z.string().trim().min(1, 'name_ar must not be empty'),
  name_fr: z.string().trim().min(1, 'name_fr must not be empty'),
  name_en: z.string().trim().min(1).optional(),
  post_code: z.string().trim().optional(),
});

const ZONE_1_WILAYAS = new Set([9, 16, 35, 42]);
const ZONE_3_WILAYAS = new Set([
  1, 3, 8, 11, 30, 32, 33, 37, 39, 45, 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
  63, 64, 65, 66, 67, 68, 69,
]);

function resolveZone(wilayaId) {
  if (ZONE_1_WILAYAS.has(wilayaId)) return 1;
  if (ZONE_3_WILAYAS.has(wilayaId)) return 3;
  return 2;
}

export function validateAndTransformGeo(rawWilayas, rawCommunes) {
  const wilayas = z.array(RawWilayaSchema).min(1).parse(rawWilayas);
  const communes = z.array(RawCommuneSchema).min(1).parse(rawCommunes);

  const seenWilayaCodes = new Set();
  const wilayaByCode = new Map();
  const transformedWilayas = [];

  for (const w of wilayas) {
    if (seenWilayaCodes.has(w.code)) {
      throw new Error(`Duplicate wilaya code: ${w.code}`);
    }
    seenWilayaCodes.add(w.code);
    const id = Number.parseInt(w.code, 10);
    const rec = {
      id,
      name: w.name_fr,
      name_ar: w.name_ar,
      name_en: w.name_en ?? w.name_fr,
      era: w.era,
      zone: resolveZone(id),
      is_deliverable: true,
    };
    wilayaByCode.set(w.code, rec);
    transformedWilayas.push(rec);
  }
  transformedWilayas.sort((a, b) => a.id - b.id);

  const seenCommuneCodes = new Set();
  const transformedCommunes = [];

  for (const c of communes) {
    if (seenCommuneCodes.has(c.code)) {
      throw new Error(`Duplicate commune code: ${c.code}`);
    }
    seenCommuneCodes.add(c.code);

    const parent = wilayaByCode.get(c.wilaya_code);
    if (!parent) {
      throw new Error(`Commune ${c.code} (${c.name_fr}) references unknown wilaya ${c.wilaya_code}`);
    }
    if (c.wilaya_code_58 && !wilayaByCode.has(c.wilaya_code_58)) {
      throw new Error(`Commune ${c.code} references unknown wilaya_code_58 ${c.wilaya_code_58}`);
    }
    if (c.wilaya_code_48 && !wilayaByCode.has(c.wilaya_code_48)) {
      throw new Error(`Commune ${c.code} references unknown wilaya_code_48 ${c.wilaya_code_48}`);
    }

    const id = Number.parseInt(c.code, 10);
    transformedCommunes.push({
      id,
      name: c.name_fr,
      name_ar: c.name_ar,
      name_en: c.name_en ?? c.name_fr,
      wilaya_id: parent.id,
      wilaya_name: parent.name,
      wilaya_id_58: c.wilaya_code_58 ? Number.parseInt(c.wilaya_code_58, 10) : parent.id,
      post_code: c.post_code ?? '',
      has_stop_desk: c.code.endsWith('01'),
      is_deliverable: true,
    });
  }
  transformedCommunes.sort((a, b) => a.id - b.id);

  return {
    wilayas: transformedWilayas,
    communes: transformedCommunes,
  };
}

export function resolveGeoInputDir(explicitDir) {
  const candidates = explicitDir
    ? [path.resolve(ROOT_DIR, explicitDir)]
    : [
        path.join(ROOT_DIR, 'data', 'algeria-geo'),
        path.join(ROOT_DIR, 'algeria-geo-main', 'data'),
      ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'wilayas.json')) && existsSync(path.join(dir, 'communes.json'))) {
      return dir;
    }
  }
  throw new Error(
    `Could not find wilayas.json & communes.json in: ${candidates.join(', ')}`,
  );
}

function main() {
  const argIdx = process.argv.indexOf('--input');
  const explicit = argIdx !== -1 ? process.argv[argIdx + 1] : undefined;
  const inputDir = resolveGeoInputDir(explicit);

  const rawWilayas = JSON.parse(readFileSync(path.join(inputDir, 'wilayas.json'), 'utf8'));
  const rawCommunes = JSON.parse(readFileSync(path.join(inputDir, 'communes.json'), 'utf8'));
  const dataset = validateAndTransformGeo(rawWilayas, rawCommunes);

  const outputPath = path.join(ROOT_DIR, 'packages', 'mock-yalidine', 'src', 'algeria-geo.generated.ts');
  const fileContent = [
    '// Auto-generated by scripts/import-geo.mjs from algeria-geo (administrative codes and AR/FR/EN names only; ODbL coordinates omitted).',
    `export const GENERATED_WILAYAS = ${JSON.stringify(dataset.wilayas)} as const;`,
    `export const GENERATED_COMMUNES = ${JSON.stringify(dataset.communes)} as const;`,
    '',
  ].join('\n');

  writeFileSync(outputPath, fileContent, 'utf8');
  console.log(
    `Imported ${dataset.wilayas.length} wilayas and ${dataset.communes.length} communes from ${path.relative(ROOT_DIR, inputDir)} -> ${path.relative(ROOT_DIR, outputPath)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
