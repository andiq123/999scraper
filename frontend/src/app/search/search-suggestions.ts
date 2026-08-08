import { fold, parseSearchIntent } from './search-intent';
import { popularChineseVehicleSearches, vehicleEntityCompletions, vehicleModelSearches } from './vehicle-catalog';

export type SuggestionKind = 'recent' | 'item' | 'category' | 'refine' | 'direct';
export interface SearchSuggestion {
  value: string;
  label: string;
  hint: string;
  kind: SuggestionKind;
}

export const marketCategories = [
  { label: 'Cars', query: 'autoturism' },
  { label: 'Property', query: 'apartament' },
  { label: 'Motorcycles', query: 'motocicletă' },
  { label: 'Commercial vehicles', query: 'transport comercial' },
  { label: 'Car parts', query: 'piese auto' },
  { label: 'Tyres & wheels', query: 'anvelope auto' },
  { label: 'Phones', query: 'telefon' },
  { label: 'Computers', query: 'calculator' },
  { label: 'Construction', query: 'construcții' },
  { label: 'Clothing', query: 'haine' },
  { label: 'Furniture', query: 'mobilă' },
  { label: 'Audio & video', query: 'televizor' },
  { label: 'Jobs', query: 'job' },
  { label: 'Agriculture', query: 'agricultură' },
  { label: 'Services', query: 'servicii' },
  { label: 'Pets', query: 'animale' },
  { label: 'Sport', query: 'bicicletă' },
  { label: 'Beauty', query: 'cosmetice' },
  { label: 'Travel', query: 'turism' },
  { label: 'Business', query: 'echipament afaceri' },
  { label: 'Music', query: 'chitară' },
  { label: 'Appliances', query: 'frigider' },
  { label: 'Events', query: 'decor evenimente' },
  { label: 'Kids', query: 'jucării' },
  { label: 'Home & office', query: 'articole casă' },
  { label: 'Other', query: 'colecții' },
] as const;

const popularItems: ReadonlyArray<Omit<SearchSuggestion, 'kind'>> = [
  ...popularChineseVehicleSearches.map((value) => ({ value, label: value, hint: 'Car' })),
  ...vehicleModelSearches.map((item) => ({ ...item, hint: 'Car model' })),
  { value: 'Volkswagen', label: 'Volkswagen', hint: 'Car brand' },
  { value: 'Volkswagen Golf', label: 'Volkswagen Golf', hint: 'Car' },
  { value: 'Volkswagen Passat', label: 'Volkswagen Passat', hint: 'Car' },
  { value: 'Volkswagen Tiguan', label: 'Volkswagen Tiguan', hint: 'Car' },
  { value: 'Tesla Model 3', label: 'Tesla Model 3', hint: 'Car' },
  { value: 'Toyota Corolla', label: 'Toyota Corolla', hint: 'Car' },
  { value: 'Honda Civic', label: 'Honda Civic', hint: 'Car' },
  { value: 'BMW X5', label: 'BMW X5', hint: 'Car' },
  { value: 'Dacia Duster', label: 'Dacia Duster', hint: 'Car' },
  { value: 'Mercedes-Benz', label: 'Mercedes-Benz', hint: 'Car' },
  { value: 'Audi', label: 'Audi', hint: 'Car brand' },
  { value: 'Škoda', label: 'Škoda', hint: 'Car brand' },
  { value: 'Renault', label: 'Renault', hint: 'Car brand' },
  { value: 'Volvo', label: 'Volvo', hint: 'Car brand' },
  { value: 'iPhone 16 Pro', label: 'iPhone 16 Pro', hint: 'Phone' },
  { value: 'Samsung Galaxy', label: 'Samsung Galaxy', hint: 'Phone' },
  { value: 'Google Pixel', label: 'Google Pixel', hint: 'Phone' },
  { value: 'MacBook Pro', label: 'MacBook Pro', hint: 'Laptop' },
  { value: 'Lenovo ThinkPad laptop', label: 'Lenovo ThinkPad', hint: 'Laptop' },
  { value: 'Dell laptop', label: 'Dell laptop', hint: 'Laptop' },
  { value: 'ASUS laptop', label: 'ASUS laptop', hint: 'Laptop' },
  { value: 'Acer laptop', label: 'Acer laptop', hint: 'Laptop' },
  { value: 'PlayStation 5', label: 'PlayStation 5', hint: 'Console' },
  { value: 'smart TV Samsung', label: 'Samsung Smart TV', hint: 'TV' },
  { value: 'apartament de închiriat', label: 'Apartment for rent', hint: 'Property' },
  { value: 'apartament de vânzare', label: 'Apartment for sale', hint: 'Property' },
  { value: 'casă de vânzare', label: 'House for sale', hint: 'Property' },
  { value: 'bicicletă', label: 'Bicycle', hint: 'Sport' },
  { value: 'frigider', label: 'Refrigerator', hint: 'Appliance' },
  { value: 'mobilă', label: 'Furniture', hint: 'Home' },
  { value: 'anvelope auto', label: 'Car tyres', hint: 'Transport' },
];

const entityCompletions: ReadonlyArray<{ canonical: string; aliases: readonly string[] }> = [
  ...vehicleEntityCompletions,
  { canonical: 'iPhone', aliases: ['iphone'] },
  { canonical: 'PlayStation', aliases: ['playstation'] },
  { canonical: 'Samsung', aliases: ['samsung'] },
  { canonical: 'Xiaomi', aliases: ['xiaomi'] },
  { canonical: 'Lenovo', aliases: ['lenovo'] },
  { canonical: 'MacBook', aliases: ['macbook'] },
];

/** Completes only a unique marketplace entity prefix; ambiguous text is never guessed. */
export function completeSearchInput(input: string): string {
  for (const token of input.matchAll(/[\p{L}\p{N}-]+/gu)) {
    const typed = fold(token[0]);
    if (typed.length < 3) continue;
    const matches = entityCompletions.filter((entity) => entity.aliases.some((alias) => fold(alias).startsWith(typed)));
    const canonical = [...new Set(matches.map((entity) => entity.canonical))];
    if (canonical.length !== 1 || matches.some((entity) => entity.aliases.some((alias) => fold(alias) === typed)))
      continue;
    const start = token.index ?? 0;
    return `${input.slice(0, start)}${canonical[0]}${input.slice(start + token[0].length)}`;
  }
  return input;
}

export function suggestionsFor(input: string, recent: readonly string[], limit = 7): SearchSuggestion[] {
  const query = input.trim();
  const normalized = fold(query);
  if (!normalized) return [];

  const ranked: Array<SearchSuggestion & { score: number }> = [];
  for (const [index, value] of recent.entries()) {
    const score = matchScore(normalized, fold(value));
    if (score !== null) ranked.push({ value, label: value, hint: 'Recent', kind: 'recent', score: score - 20 + index });
  }
  for (const item of popularItems) {
    const score = matchScore(normalized, fold(`${item.label} ${item.value} ${item.hint}`));
    if (score !== null) ranked.push({ ...item, kind: 'item', score });
  }
  for (const category of marketCategories) {
    const score = matchScore(normalized, fold(`${category.label} ${category.query}`));
    if (score !== null)
      ranked.push({
        value: category.query,
        label: category.label,
        hint: 'Category',
        kind: 'category',
        score: score + 8,
      });
  }
  ranked.push({ value: query, label: `Search for “${query}”`, hint: 'All categories', kind: 'direct', score: 24 });
  ranked.push(...refinementsFor(query).map((item, index) => ({ ...item, score: 30 + index })));

  const seen = new Set<string>();
  return ranked
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
    .filter((item) => {
      const key = fold(item.value);
      const seenKey = item.kind === 'direct' ? `direct:${key}` : key;
      if ((key === normalized && item.kind !== 'direct') || seen.has(seenKey)) return false;
      seen.add(seenKey);
      return true;
    })
    .slice(0, limit)
    .map(({ score: _, ...item }) => item);
}

function matchScore(query: string, candidate: string): number | null {
  if (candidate.startsWith(query)) return 0;
  const queryWords = query.split(/\s+/);
  const candidateWords = candidate.split(/\s+/);
  if (queryWords.every((word) => candidateWords.some((candidateWord) => candidateWord.startsWith(word)))) return 6;
  const index = candidate.indexOf(query);
  if (index >= 0) return 12 + Math.min(index, 20);
  if (
    query.length >= 4 &&
    queryWords.every((word) => candidateWords.some((candidateWord) => nearbyWord(word, candidateWord)))
  )
    return 16;
  return null;
}

function nearbyWord(left: string, right: string): boolean {
  const limit = left.length >= 5 ? 2 : 1;
  if (Math.abs(left.length - right.length) > limit) return false;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1]),
      );
      rowMinimum = Math.min(rowMinimum, current[column]);
    }
    if (rowMinimum > limit) return false;
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] <= limit;
}

function refinementsFor(query: string): SearchSuggestion[] {
  if (query.length < 3) return [];
  const plain = fold(query);
  const intent = parseSearchIntent(query);
  const result: SearchSuggestion[] = [];
  const add = (suffix: string, hint: string): void => {
    result.push({ value: `${query} ${suffix}`, label: `${query} ${suffix}`, hint, kind: 'refine' });
  };

  if (intent.kind === 'vehicle') {
    if (!intent.transmission) add('automatic', 'Gearbox');
    if (intent.mileage.from === null && intent.mileage.to === null) add('under 150k km', 'Mileage');
    if (intent.price.from === null && intent.price.to === null) add('under 10000 EUR', 'Budget');
    if (!intent.registration) add('înmatriculată în Republica Moldova', 'Registration');
  } else if (['iphone', 'phone', 'playstation', 'laptop'].includes(intent.kind)) {
    if (intent.storage.from === null && intent.storage.to === null) add('256 GB', 'Storage');
    if (intent.price.from === null && intent.price.to === null) add('under 10000 MDL', 'Budget');
  } else if (intent.kind === 'tv' && intent.screen.from === null && intent.screen.to === null) {
    add('55 inch', 'Screen');
  } else if (intent.kind === 'realEstate') {
    if (!intent.listingMode && !/(inchiri|chirie|vanzare|vand)/.test(plain)) add('de închiriat', 'Listing type');
    if (intent.rooms.from === null && intent.rooms.to === null) add('2 camere', 'Rooms');
  }
  return result;
}
