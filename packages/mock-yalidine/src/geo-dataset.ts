import { GENERATED_COMMUNES, GENERATED_WILAYAS } from './algeria-geo.generated.js';

export interface WilayaRecord {
  id: number;
  name: string;
  name_ar?: string;
  name_en?: string;
  era?: 48 | 58 | 69;
  zone: number;
  is_deliverable: boolean;
}

export interface CommuneRecord {
  id: number;
  name: string;
  name_ar?: string;
  name_en?: string;
  wilaya_id: number;
  wilaya_name: string;
  wilaya_id_58?: number;
  post_code?: string;
  has_stop_desk: boolean;
  is_deliverable: boolean;
}

export interface CenterRecord {
  center_id: number;
  name: string;
  address: string;
  wilaya_id: number;
  wilaya_name: string;
  commune_id: number;
  commune_name: string;
}

export interface DeliveryFeeRecord {
  from_wilaya_id: number;
  to_wilaya_id: number;
  wilaya_id: number;
  wilaya_name: string;
  home_fee: number;
  stopdesk_fee: number;
  fee: number;
  retour_fee: number;
}

export interface GeoDatasetMetadata {
  complete: boolean;
  totalWilayasIncluded: number;
  totalCommunesIncluded: number;
  note: string;
}

/**
 * Clean interface for Algerian administrative geo data.
 * Allows swapping the built-in minimal verified subset with the full 69-wilaya
 * imported `algeria-geo` dataset.
 */
export interface GeoDataset {
  readonly meta: GeoDatasetMetadata;
  getWilayas(): WilayaRecord[];
  findWilaya(idOrName: number | string): WilayaRecord | undefined;
  getCommunes(wilayaId?: number): CommuneRecord[];
  findCommune(wilayaId: number, communeName: string): CommuneRecord | undefined;
  getCenters(wilayaId?: number): CenterRecord[];
  findCenter(centerId: number): CenterRecord | undefined;
  getDeliveryFee(fromWilayaId: number, toWilayaId: number): DeliveryFeeRecord | undefined;
}

const MINIMAL_WILAYAS: WilayaRecord[] = [
  { id: 6, name: 'Béjaïa', zone: 2, is_deliverable: true },
  { id: 9, name: 'Blida', zone: 1, is_deliverable: true },
  { id: 15, name: 'Tizi Ouzou', zone: 2, is_deliverable: true },
  { id: 16, name: 'Alger', zone: 1, is_deliverable: true },
  { id: 19, name: 'Sétif', zone: 2, is_deliverable: true },
  { id: 23, name: 'Annaba', zone: 2, is_deliverable: true },
  { id: 25, name: 'Constantine', zone: 2, is_deliverable: true },
  { id: 31, name: 'Oran', zone: 2, is_deliverable: true },
];

const MINIMAL_COMMUNES: CommuneRecord[] = [
  { id: 601, name: 'Béjaïa', wilaya_id: 6, wilaya_name: 'Béjaïa', has_stop_desk: true, is_deliverable: true },
  { id: 602, name: 'Akbou', wilaya_id: 6, wilaya_name: 'Béjaïa', has_stop_desk: false, is_deliverable: true },
  { id: 901, name: 'Blida', wilaya_id: 9, wilaya_name: 'Blida', has_stop_desk: true, is_deliverable: true },
  { id: 902, name: 'Boufarik', wilaya_id: 9, wilaya_name: 'Blida', has_stop_desk: false, is_deliverable: true },
  { id: 1501, name: 'Tizi Ouzou', wilaya_id: 15, wilaya_name: 'Tizi Ouzou', has_stop_desk: true, is_deliverable: true },
  { id: 1502, name: 'Azazga', wilaya_id: 15, wilaya_name: 'Tizi Ouzou', has_stop_desk: false, is_deliverable: true },
  { id: 1601, name: 'Alger Centre', wilaya_id: 16, wilaya_name: 'Alger', has_stop_desk: true, is_deliverable: true },
  { id: 1602, name: 'Bab Ezzouar', wilaya_id: 16, wilaya_name: 'Alger', has_stop_desk: true, is_deliverable: true },
  { id: 1603, name: 'Hydra', wilaya_id: 16, wilaya_name: 'Alger', has_stop_desk: false, is_deliverable: true },
  { id: 1604, name: 'Kouba', wilaya_id: 16, wilaya_name: 'Alger', has_stop_desk: true, is_deliverable: true },
  { id: 1901, name: 'Sétif', wilaya_id: 19, wilaya_name: 'Sétif', has_stop_desk: true, is_deliverable: true },
  { id: 1902, name: 'El Eulma', wilaya_id: 19, wilaya_name: 'Sétif', has_stop_desk: true, is_deliverable: true },
  { id: 2301, name: 'Annaba', wilaya_id: 23, wilaya_name: 'Annaba', has_stop_desk: true, is_deliverable: true },
  { id: 2302, name: 'El Bouni', wilaya_id: 23, wilaya_name: 'Annaba', has_stop_desk: false, is_deliverable: true },
  { id: 2501, name: 'Constantine', wilaya_id: 25, wilaya_name: 'Constantine', has_stop_desk: true, is_deliverable: true },
  { id: 2502, name: 'El Khroub', wilaya_id: 25, wilaya_name: 'Constantine', has_stop_desk: true, is_deliverable: true },
  { id: 3101, name: 'Oran', wilaya_id: 31, wilaya_name: 'Oran', has_stop_desk: true, is_deliverable: true },
  { id: 3102, name: 'Bir El Djir', wilaya_id: 31, wilaya_name: 'Oran', has_stop_desk: true, is_deliverable: true },
  { id: 3103, name: 'Es Senia', wilaya_id: 31, wilaya_name: 'Oran', has_stop_desk: false, is_deliverable: true },
];

const SIMULATED_CENTERS: CenterRecord[] = [
  { center_id: 160101, name: 'Agence Alger Centre', address: 'Rue Didouche Mourad, Alger', wilaya_id: 16, wilaya_name: 'Alger', commune_id: 1601, commune_name: 'Alger Centre' },
  { center_id: 160201, name: 'Agence Bab Ezzouar', address: 'Quartier Business, Bab Ezzouar', wilaya_id: 16, wilaya_name: 'Alger', commune_id: 1602, commune_name: 'Bab Ezzouar' },
  { center_id: 310201, name: 'Agence Bir El Djir', address: 'Boulevard Millénium, Oran', wilaya_id: 31, wilaya_name: 'Oran', commune_id: 3102, commune_name: 'Bir El Djir' },
  { center_id: 250101, name: 'Agence Constantine', address: 'Cité Zouaghi, Constantine', wilaya_id: 25, wilaya_name: 'Constantine', commune_id: 2501, commune_name: 'Constantine' },
  { center_id: 190101, name: 'Agence Sétif', address: 'Avenue 1er Novembre, Sétif', wilaya_id: 19, wilaya_name: 'Sétif', commune_id: 1901, commune_name: 'Sétif' },
  { center_id: 90101, name: 'Agence Blida', address: 'Centre Ville, Blida', wilaya_id: 9, wilaya_name: 'Blida', commune_id: 901, commune_name: 'Blida' },
  { center_id: 60101, name: 'Agence Béjaïa', address: 'Avenue de la Liberté, Béjaïa', wilaya_id: 6, wilaya_name: 'Béjaïa', commune_id: 601, commune_name: 'Béjaïa' },
  { center_id: 230101, name: 'Agence Annaba', address: 'Cours de la Révolution, Annaba', wilaya_id: 23, wilaya_name: 'Annaba', commune_id: 2301, commune_name: 'Annaba' },
  { center_id: 150101, name: 'Agence Tizi Ouzou', address: 'Nouvelle Ville, Tizi Ouzou', wilaya_id: 15, wilaya_name: 'Tizi Ouzou', commune_id: 1501, commune_name: 'Tizi Ouzou' },
];

export function normalizeGeoName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/['’`-]/g, ' ')
    .replace(/\s+/g, ' ');
}

function wilayaMatchesName(w: WilayaRecord, normTarget: string): boolean {
  if (normalizeGeoName(w.name) === normTarget) return true;
  if (w.name_ar && normalizeGeoName(w.name_ar) === normTarget) return true;
  if (w.name_en && normalizeGeoName(w.name_en) === normTarget) return true;
  return false;
}

function communeMatchesName(c: CommuneRecord, normTarget: string): boolean {
  if (normalizeGeoName(c.name) === normTarget) return true;
  if (c.name_ar && normalizeGeoName(c.name_ar) === normTarget) return true;
  if (c.name_en && normalizeGeoName(c.name_en) === normTarget) return true;
  return false;
}

function buildDatasetImpl(
  wilayas: readonly WilayaRecord[],
  communes: readonly CommuneRecord[],
  centers: readonly CenterRecord[],
  meta: GeoDatasetMetadata,
): GeoDataset {
  const findWilaya = (idOrName: number | string): WilayaRecord | undefined => {
    if (typeof idOrName === 'number') {
      return wilayas.find((w) => w.id === idOrName);
    }
    const asNum = Number.parseInt(idOrName, 10);
    if (!Number.isNaN(asNum) && String(asNum) === idOrName.trim()) {
      return wilayas.find((w) => w.id === asNum);
    }
    const norm = normalizeGeoName(idOrName);
    return wilayas.find((w) => wilayaMatchesName(w, norm));
  };

  return {
    meta,
    getWilayas: () => [...wilayas],
    findWilaya,
    getCommunes: (wilayaId?: number) => {
      if (wilayaId === undefined) return [...communes];
      return communes.filter((c) => c.wilaya_id === wilayaId);
    },
    findCommune: (wilayaId: number, communeName: string) => {
      const norm = normalizeGeoName(communeName);
      return communes.find(
        (c) =>
          (c.wilaya_id === wilayaId || c.wilaya_id_58 === wilayaId) &&
          communeMatchesName(c, norm),
      );
    },
    getCenters: (wilayaId?: number) => {
      if (wilayaId === undefined) return [...centers];
      return centers.filter((c) => c.wilaya_id === wilayaId);
    },
    findCenter: (centerId: number) => centers.find((c) => c.center_id === centerId),
    getDeliveryFee: (fromWilayaId: number, toWilayaId: number) => {
      const dest = findWilaya(toWilayaId);
      if (!dest || !findWilaya(fromWilayaId)) return undefined;
      const sameWilaya = fromWilayaId === toWilayaId;
      const homeFee = sameWilaya ? 400 : 600 + dest.zone * 100;
      const stopdeskFee = Math.max(300, homeFee - 200);
      return {
        from_wilaya_id: fromWilayaId,
        to_wilaya_id: toWilayaId,
        wilaya_id: dest.id,
        wilaya_name: dest.name,
        home_fee: homeFee,
        stopdesk_fee: stopdeskFee,
        fee: homeFee,
        retour_fee: 300,
      };
    },
  };
}

export class MinimalAlgeriaGeoDataset implements GeoDataset {
  readonly meta: GeoDatasetMetadata = {
    complete: false,
    totalWilayasIncluded: MINIMAL_WILAYAS.length,
    totalCommunesIncluded: MINIMAL_COMMUNES.length,
    note: 'Minimal verified subset (8 wilayas, 19 communes, 9 stopdesk centers).',
  };

  private readonly impl = buildDatasetImpl(MINIMAL_WILAYAS, MINIMAL_COMMUNES, SIMULATED_CENTERS, this.meta);

  getWilayas = () => this.impl.getWilayas();
  findWilaya = (idOrName: number | string) => this.impl.findWilaya(idOrName);
  getCommunes = (wilayaId?: number) => this.impl.getCommunes(wilayaId);
  findCommune = (wilayaId: number, communeName: string) => this.impl.findCommune(wilayaId, communeName);
  getCenters = (wilayaId?: number) => this.impl.getCenters(wilayaId);
  findCenter = (centerId: number) => this.impl.findCenter(centerId);
  getDeliveryFee = (fromId: number, toId: number) => this.impl.getDeliveryFee(fromId, toId);
}

export class FullAlgeriaGeoDataset implements GeoDataset {
  readonly meta: GeoDatasetMetadata = {
    complete: true,
    totalWilayasIncluded: GENERATED_WILAYAS.length,
    totalCommunesIncluded: GENERATED_COMMUNES.length,
    note: `Full ${GENERATED_WILAYAS.length}-wilaya (eras 48/58/69) & ${GENERATED_COMMUNES.length}-commune dataset imported via scripts/import-geo.mjs (AR/FR/EN names; coordinates excluded).`,
  };

  private readonly impl = buildDatasetImpl(GENERATED_WILAYAS, GENERATED_COMMUNES, SIMULATED_CENTERS, this.meta);

  getWilayas = () => this.impl.getWilayas();
  findWilaya = (idOrName: number | string) => this.impl.findWilaya(idOrName);
  getCommunes = (wilayaId?: number) => this.impl.getCommunes(wilayaId);
  findCommune = (wilayaId: number, communeName: string) => this.impl.findCommune(wilayaId, communeName);
  getCenters = (wilayaId?: number) => this.impl.getCenters(wilayaId);
  findCenter = (centerId: number) => this.impl.findCenter(centerId);
  getDeliveryFee = (fromId: number, toId: number) => this.impl.getDeliveryFee(fromId, toId);
}
