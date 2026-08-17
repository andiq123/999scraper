import type { Product } from '../models';
import { fold } from './search-intent';

export type ListingQualityTier = 'excellent' | 'good' | 'fair' | 'limited';
type ListingKind = 'vehicle' | 'device' | 'property' | 'general';

export interface ListingQuality {
  score: number;
  label: string;
  tier: ListingQualityTier;
  strengths: string[];
  concerns: string[];
}

interface QualityProfile {
  kind: ListingKind;
  name: string;
  core: ReadonlyArray<keyof Product>;
  details: ReadonlyArray<keyof Product>;
}

const profiles: Record<ListingKind, QualityProfile> = {
  vehicle: {
    kind: 'vehicle',
    name: 'vehicle',
    core: ['year', 'make', 'model', 'mileage', 'price', 'fuel', 'transmission'],
    details: ['bodyType', 'power', 'drivetrain', 'originCountry', 'registration', 'condition'],
  },
  device: {
    kind: 'device',
    name: 'device',
    core: ['price', 'brand', 'deviceModel', 'condition'],
    details: ['storage', 'ram', 'processor', 'gpu', 'screen', 'resolution', 'os'],
  },
  property: {
    kind: 'property',
    name: 'property',
    core: ['price', 'rooms', 'area', 'sector'],
    details: ['housingStock', 'listingAuthor', 'floor', 'propertyState', 'buildingType'],
  },
  general: {
    kind: 'general',
    name: 'listing',
    core: ['price', 'category', 'condition', 'offerType'],
    details: [],
  },
};
const vehicleIdentityFields: ReadonlyArray<keyof Product> = [
  'make',
  'model',
  'fuel',
  'transmission',
  'bodyType',
  'mileage',
  'drivetrain',
  'vin',
];
const deviceIdentityFields: ReadonlyArray<keyof Product> = [
  'deviceModel',
  'storage',
  'ram',
  'processor',
  'gpu',
  'screen',
  'resolution',
  'os',
];
const propertyIdentityFields: ReadonlyArray<keyof Product> = [
  'rooms',
  'area',
  'sector',
  'housingStock',
  'floor',
  'propertyState',
  'buildingType',
];
const currentYear = new Date().getFullYear();
const scoreCache = new WeakMap<Product, number>();

export function isVehicleListing(product: Product): boolean {
  return completed(product, vehicleIdentityFields) >= 2;
}

export function listingQuality(product: Product): ListingQuality {
  const profile = qualityProfile(product);
  const wanted = isWantedListing(product);
  const parts = isPartsVehicleAd(product);
  if (wanted || parts) {
    return {
      score: 1,
      label: parts ? 'Parts, not a complete item' : 'Not a sale ad',
      tier: 'limited',
      strengths: [],
      concerns: parts
        ? ['Parts or dismantling category', 'Not a complete item listing']
        : ['Buyer/wanted ad—not an item for sale', 'Displayed price is not a sale price'],
    };
  }

  const coreCount = completed(product, profile.core);
  const detailCount = completed(product, profile.details);
  const words = usefulDescriptionWords(product);
  const photos = Math.max(product.imageCount ?? 0, product.thumbnailURL ? 1 : 0);
  const score = listingQualityScore(product);
  const riskConcerns = profile.kind === 'vehicle' ? explicitVehicleConcerns(product) : [];
  const inconsistentMileage = profile.kind === 'vehicle' && hasSuspiciousMileage(product);
  const exchangeOnly = isExchangeListing(product);
  const marketingPercent = product.descriptionMarketingPercent ?? 0;
  const marketingHeavy = marketingPercent >= 30;
  const meaning = riskConcerns.length
    ? { label: 'Major concern disclosed', tier: 'limited' as const }
    : inconsistentMileage
      ? { label: 'Data looks inconsistent', tier: 'fair' as const }
      : exchangeOnly
        ? { label: 'Exchange listing', tier: 'fair' as const }
        : marketingHeavy
          ? { label: 'Promotional description', tier: 'fair' as const }
          : scoreMeaning(score);

  const strengths: string[] = [];
  if (profile.kind === 'vehicle' && product.vin) strengths.push('VIN included');
  if (!marketingHeavy && words >= 40) strengths.push(`Detailed item description · ${words} useful words`);
  else if (!marketingHeavy && words >= 15) strengths.push(`Concise item details · ${words} useful words`);
  if (photos >= 4) strengths.push(`${photos} photos`);
  if (coreCount >= Math.ceil(profile.core.length * 0.75)) {
    strengths.push(`${coreCount}/${profile.core.length} essential ${profile.name} details`);
  }
  if (profile.details.length && detailCount >= Math.ceil(profile.details.length * 0.6)) {
    strengths.push(`${detailCount}/${profile.details.length} extra ${profile.name} details`);
  }

  const concerns = [...riskConcerns];
  if (inconsistentMileage) concerns.push('Mileage is implausibly low for the vehicle age');
  if (exchangeOnly) concerns.push('Exchange offer—not a standard sale');
  if (marketingHeavy) concerns.push(`${marketingPercent}% of description looks promotional or repetitive`);
  if (!present(product.price)) concerns.push('Price is missing or unclear');
  if (profile.kind === 'vehicle' && !product.vin) concerns.push('VIN not provided');
  if (words < 15) concerns.push(words ? 'Description is very short' : 'Description is missing');
  if (photos < 4) concerns.push(photos ? `Only ${photos} photo${photos === 1 ? '' : 's'}` : 'No photos');
  if (coreCount < Math.ceil(profile.core.length * 0.75)) {
    concerns.push(`${profile.core.length - coreCount} essential ${profile.name} details missing`);
  }

  return {
    score,
    label: meaning.label,
    tier: meaning.tier,
    strengths: strengths.slice(0, 3),
    concerns: concerns.slice(0, 3),
  };
}

export function listingQualityScore(product: Product): number {
  const cached = scoreCache.get(product);
  if (cached !== undefined) return cached;
  const score = calculateListingQualityScore(product);
  scoreCache.set(product, score);
  return score;
}

function calculateListingQualityScore(product: Product): number {
  if (isWantedListing(product) || isPartsVehicleAd(product)) return 1;
  const profile = qualityProfile(product);
  const words = usefulDescriptionWords(product);
  const photos = Math.max(product.imageCount ?? 0, product.thumbnailURL ? 1 : 0);
  const hasDetails = profile.details.length > 0;
  const rawScore =
    1 +
    titlePoints(product.title) +
    (profile.kind === 'vehicle' && product.vin ? 1 : 0) +
    descriptionPoints(words) +
    photoPoints(photos) +
    (hasDetails ? 3 : 4.5) * completionRatio(product, profile.core) +
    (hasDetails ? 1.5 * completionRatio(product, profile.details) : 0);
  let score = Math.max(1, Math.min(10, Math.round(rawScore)));
  if (profile.kind === 'vehicle') {
    const riskCount = explicitVehicleConcerns(product).length;
    if (riskCount) score = Math.min(score, riskCount > 1 ? 3 : 4);
    if (hasSuspiciousMileage(product)) score = Math.min(score, 6);
  }
  if (isExchangeListing(product)) score = Math.min(score, 6);
  const marketingPercent = product.descriptionMarketingPercent ?? 0;
  if (marketingPercent >= 65) score = Math.min(score, 5);
  else if (marketingPercent >= 45) score = Math.min(score, 6);
  else if (marketingPercent >= 30) score = Math.min(score, 7);
  return score;
}

export function isWantedListing(product: Product): boolean {
  return hasPhrase(listingText(product), [
    'cumpar',
    'cumparare',
    'achizitionez',
    'wanted',
    'buying',
    'куплю',
    'купим',
    'покупаю',
  ]);
}

export function isPartsVehicleAd(product: Product): boolean {
  return /dezmembr|caroserii|piese.{0,20}auto|auto.{0,20}piese|авторазбор|запчаст.{0,20}авто/u.test(
    listingText(product),
  );
}

export function matchesListingCondition(product: Product, expected: 'new' | 'used'): boolean {
  const explicit = fold(product.condition ?? '').trim();
  const value = explicit || fold(product.title);
  const used =
    hasPhrase(value, ['uzat', 'folosit', 'rulaj', 'used', 'second hand', 'pre owned', 'б у']) ||
    /подержанн\p{L}*/u.test(value);
  if (expected === 'used') return used;
  return !used && (hasPhrase(value, ['nou', 'noua', 'new', 'sigilat', 'sealed']) || /нов\p{L}*/u.test(value));
}

function qualityProfile(product: Product): QualityProfile {
  if (isVehicleListing(product) || isPartsVehicleAd(product)) return profiles.vehicle;
  if (completed(product, propertyIdentityFields) >= 2) return profiles.property;
  if (completed(product, deviceIdentityFields) >= 2) return profiles.device;
  return profiles.general;
}

function isExchangeListing(product: Product): boolean {
  return hasPhrase(product.offerType ?? '', ['schimb', 'exchange', 'обмен']);
}

function listingText(product: Product): string {
  return fold(`${product.offerType ?? ''} ${product.category ?? ''} ${product.title}`);
}

function hasPhrase(value: string, phrases: readonly string[]): boolean {
  const searchable = ` ${fold(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
  return phrases.some((phrase) => searchable.includes(` ${fold(phrase)} `));
}

function hasSuspiciousMileage(product: Product): boolean {
  const year = product.year ?? 0;
  const mileage = product.mileage ?? 0;
  return year > 0 && year <= currentYear - 5 && mileage > 0 && mileage < 1_000;
}

function explicitVehicleConcerns(product: Product): string[] {
  const flags = new Set(product.vehicleFlags ?? []);
  const concerns: string[] = [];
  if (flags.has('accidentDamage')) concerns.push('Accident or body damage disclosed');
  if (flags.has('mechanicalIssue')) concerns.push('Repair or mechanical issue disclosed');
  if (flags.has('documentRisk')) concerns.push('Document or registration concern disclosed');
  return concerns;
}

function completed(product: Product, fields: ReadonlyArray<keyof Product>): number {
  return fields.reduce((count, field) => count + (present(product[field]) ? 1 : 0), 0);
}

function completionRatio(product: Product, fields: ReadonlyArray<keyof Product>): number {
  return fields.length ? completed(product, fields) / fields.length : 0;
}

function present(value: Product[keyof Product]): boolean {
  return typeof value === 'number'
    ? Number.isFinite(value) && value > 0
    : typeof value === 'string' && value.trim() !== '';
}

function titlePoints(title: string): number {
  const words = title.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  if (words >= 4) return 0.5;
  if (words >= 2) return 0.3;
  return 0;
}

function usefulDescriptionWords(product: Product): number {
  return product.descriptionUsefulWordCount ?? product.descriptionWordCount ?? 0;
}

function descriptionPoints(words: number): number {
  if (words >= 80) return 2;
  if (words >= 40) return 1.7;
  if (words >= 15) return 1.3;
  if (words >= 8) return 0.7;
  return 0;
}

function photoPoints(photos: number): number {
  if (photos >= 8) return 1;
  if (photos >= 4) return 0.75;
  if (photos >= 2) return 0.5;
  if (photos >= 1) return 0.25;
  return 0;
}

function scoreMeaning(score: number): Pick<ListingQuality, 'label' | 'tier'> {
  if (score >= 9) return { label: 'Excellent details', tier: 'excellent' };
  if (score >= 7) return { label: 'Well documented', tier: 'good' };
  if (score >= 5) return { label: 'Some useful details', tier: 'fair' };
  return { label: 'Limited details', tier: 'limited' };
}
