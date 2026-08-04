import { fold, parseSearchIntent } from './search-intent';

export type SuggestionKind = 'recent' | 'item' | 'category' | 'refine';
export interface SearchSuggestion { value: string; label: string; hint: string; kind: SuggestionKind }

export const marketCategories = [
  { label: 'Cars', query: 'autoturism' }, { label: 'Property', query: 'apartament' },
  { label: 'Phones', query: 'telefon' }, { label: 'Computers', query: 'calculator' },
  { label: 'Construction', query: 'construcții' }, { label: 'Clothing', query: 'haine' },
  { label: 'Furniture', query: 'mobilă' }, { label: 'Audio & video', query: 'televizor' },
  { label: 'Jobs', query: 'job' }, { label: 'Agriculture', query: 'agricultură' },
  { label: 'Services', query: 'servicii' }, { label: 'Pets', query: 'animale' },
  { label: 'Sport', query: 'bicicletă' }, { label: 'Beauty', query: 'cosmetice' },
  { label: 'Travel', query: 'turism' }, { label: 'Business', query: 'echipament afaceri' },
  { label: 'Music', query: 'chitară' }, { label: 'Appliances', query: 'frigider' },
  { label: 'Events', query: 'decor evenimente' }, { label: 'Kids', query: 'jucării' },
  { label: 'Home & office', query: 'articole casă' }, { label: 'Other', query: 'colecții' },
] as const;

const popularItems: ReadonlyArray<Omit<SearchSuggestion, 'kind'>> = [
  { value: 'Tesla Model 3', label: 'Tesla Model 3', hint: 'Car' },
  { value: 'Toyota Corolla', label: 'Toyota Corolla', hint: 'Car' },
  { value: 'Honda Civic', label: 'Honda Civic', hint: 'Car' },
  { value: 'BMW X5', label: 'BMW X5', hint: 'Car' },
  { value: 'Dacia Duster', label: 'Dacia Duster', hint: 'Car' },
  { value: 'Mercedes-Benz', label: 'Mercedes-Benz', hint: 'Car' },
  { value: 'iPhone 16 Pro', label: 'iPhone 16 Pro', hint: 'Phone' },
  { value: 'Samsung Galaxy', label: 'Samsung Galaxy', hint: 'Phone' },
  { value: 'Google Pixel', label: 'Google Pixel', hint: 'Phone' },
  { value: 'MacBook Pro', label: 'MacBook Pro', hint: 'Laptop' },
  { value: 'Lenovo ThinkPad laptop', label: 'Lenovo ThinkPad', hint: 'Laptop' },
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
    if (score !== null) ranked.push({ value: category.query, label: category.label, hint: 'Category', kind: 'category', score: score + 8 });
  }
  ranked.push(...refinementsFor(query).map((item, index) => ({ ...item, score: 30 + index })));

  const seen = new Set<string>();
  return ranked.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label)).filter((item) => {
    const key = fold(item.value);
    if (key === normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit).map(({ score: _, ...item }) => item);
}

function matchScore(query: string, candidate: string): number | null {
  if (candidate.startsWith(query)) return 0;
  const queryWords = query.split(/\s+/);
  const candidateWords = candidate.split(/\s+/);
  if (queryWords.every((word) => candidateWords.some((candidateWord) => candidateWord.startsWith(word)))) return 6;
  const index = candidate.indexOf(query);
  return index >= 0 ? 12 + Math.min(index, 20) : null;
}

function refinementsFor(query: string): SearchSuggestion[] {
  if (query.length < 3) return [];
  const plain = fold(query);
  const intent = parseSearchIntent(query);
  const result: SearchSuggestion[] = [];
  const add = (suffix: string, hint: string): void => { result.push({ value: `${query} ${suffix}`, label: `${query} ${suffix}`, hint, kind: 'refine' }); };

  if (intent.kind === 'vehicle') {
    if (!intent.transmission) add('automatic', 'Gearbox');
    if (intent.mileage.from === null && intent.mileage.to === null) add('under 150k km', 'Mileage');
    if (intent.price.from === null && intent.price.to === null) add('under 10000 EUR', 'Budget');
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
