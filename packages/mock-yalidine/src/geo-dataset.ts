export interface WilayaRecord {
  id: number;
  name: string;
  zone: number;
  is_deliverable: boolean;
}

export interface CommuneRecord {
  id: number;
  name: string;
  wilaya_id: number;
  wilaya_name: string;
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
 * Allows swapping the built-in minimal verified subset with a full 58/69-wilaya
 * `algeria-geo` package when available.
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

const MINIMAL_CENTERS: CenterRecord[] = [
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

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export class MinimalAlgeriaGeoDataset implements GeoDataset {
  readonly meta: GeoDatasetMetadata = {
    complete: false,
    totalWilayasIncluded: MINIMAL_WILAYAS.length,
    totalCommunesIncluded: MINIMAL_COMMUNES.length,
    note: 'Minimal verified subset (8 wilayas, 19 communes, 9 stopdesk centers). Full 58/69 wilayas & ~1541 communes await external algeria-geo dataset.',
  };

  getWilayas(): WilayaRecord[] {
    return MINIMAL_WILAYAS;
  }

  findWilaya(idOrName: number | string): WilayaRecord | undefined {
    if (typeof idOrName === 'number') {
      return MINIMAL_WILAYAS.find((w) => w.id === idOrName);
    }
    const asNum = Number.parseInt(idOrName, 10);
    if (!Number.isNaN(asNum) && String(asNum) === idOrName.trim()) {
      return MINIMAL_WILAYAS.find((w) => w.id === asNum);
    }
    const norm = normalizeName(idOrName);
    return MINIMAL_WILAYAS.find((w) => normalizeName(w.name) === norm);
  }

  getCommunes(wilayaId?: number): CommuneRecord[] {
    if (wilayaId === undefined) return MINIMAL_COMMUNES;
    return MINIMAL_COMMUNES.filter((c) => c.wilaya_id === wilayaId);
  }

  findCommune(wilayaId: number, communeName: string): CommuneRecord | undefined {
    const norm = normalizeName(communeName);
    return MINIMAL_COMMUNES.find(
      (c) => c.wilaya_id === wilayaId && normalizeName(c.name) === norm,
    );
  }

  getCenters(wilayaId?: number): CenterRecord[] {
    if (wilayaId === undefined) return MINIMAL_CENTERS;
    return MINIMAL_CENTERS.filter((c) => c.wilaya_id === wilayaId);
  }

  findCenter(centerId: number): CenterRecord | undefined {
    return MINIMAL_CENTERS.find((c) => c.center_id === centerId);
  }

  getDeliveryFee(fromWilayaId: number, toWilayaId: number): DeliveryFeeRecord | undefined {
    const dest = this.findWilaya(toWilayaId);
    if (!dest || !this.findWilaya(fromWilayaId)) return undefined;
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
  }
}
