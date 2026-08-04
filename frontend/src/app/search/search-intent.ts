export type SearchKind = 'generic' | 'vehicle' | 'iphone' | 'phone' | 'playstation' | 'laptop' | 'tv' | 'realEstate';

export interface NumberRange { from: number | null; to: number | null }
export type PropertyListingMode = 'sale' | 'monthly' | 'daily';

export interface SearchIntent {
  kind: SearchKind;
  sourceQuery: string;
  year: NumberRange;
  generation: NumberRange;
  storage: NumberRange;
  ram: NumberRange;
  rooms: NumberRange;
  area: NumberRange;
  screen: NumberRange;
  mileage: NumberRange;
  power: NumberRange;
  price: NumberRange;
  currency: number | null;
  fuel: string | null;
  transmission: string | null;
  drivetrain: string | null;
  bodyType: string | null;
  registration: 'moldova' | 'other' | null;
  condition: 'new' | 'used' | null;
  listingMode: PropertyListingMode | null;
  propertySector: string | null;
  tags: string[];
  exclusions: string[];
}

export const fuelOptions = ['Benzină', 'Diesel', 'Hybrid', 'Electricitate', 'Gaz'] as const;
export const transmissionOptions = ['Automată', 'Mecanică', 'Variator', 'Robotizată'] as const;
export const drivetrainOptions = ['Din față', 'Din spate', '4x4'] as const;
export const bodyTypeOptions = ['Sedan', 'SUV', 'Crossover', 'Hatchback', 'Universal', 'Coupe', 'Minivan'] as const;
export const storageOptions = [64, 128, 256, 512, 1024, 2048] as const;

const vehicleMakes = new Set([
  'acura', 'alfa', 'audi', 'bmw', 'cadillac', 'chery', 'chevrolet', 'chrysler', 'citroen', 'dacia',
  'daewoo', 'dodge', 'fiat', 'ford', 'haval', 'honda', 'hyundai', 'infiniti', 'jaguar', 'jeep', 'kia',
  'land rover', 'lexus', 'lixiang', 'mazda', 'mercedes', 'mercedes benz', 'mitsubishi', 'nissan', 'opel',
  'peugeot', 'porsche', 'renault', 'seat', 'skoda', 'ssangyong', 'subaru', 'suzuki', 'tank', 'tesla',
  'toyota', 'volkswagen', 'volvo', 'ваз', 'лада', 'газ', 'уаз',
]);
const vehicleModels = new Set([
  'camry', 'civic', 'corolla', 'duster', 'golf', 'logan', 'octavia', 'passat', 'prius', 'qashqai', 'rav4',
  'sandero', 'sportage', 'tucson', 'x5', 'x6',
]);
const vehiclePhrases = ['land cruiser', 'model 3', 'model s', 'model x', 'model y', 'range rover'];
const vehicleWords = new Set(['autoturism', 'autoturisme', 'automobil', 'automobile', 'masina', 'masini', 'vehicle', 'inmatriculare', 'inmatriculat', 'inmatriculata', 'автомобиль', 'автомобили']);
const laptopWords = new Set(['laptop', 'laptops', 'notebook', 'ultrabook', 'macbook', 'thinkpad', 'ideapad', 'chromebook', 'lenovo', 'dell', 'acer', 'asus', 'ноутбук']);
const phoneWords = new Set(['telefon', 'telefonul', 'smartphone', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'pixel', 'huawei', 'honor', 'oneplus', 'oppo', 'realme', 'телефон', 'смартфон']);
const tvWords = new Set(['televizor', 'televizoare', 'television', 'smarttv', 'телевизор']);
const propertyWords = new Set(['apartament', 'apartamente', 'garsoniera', 'penthouse', 'casa', 'vila', 'teren', 'imobil', 'apartment', 'house', 'land', 'квартира', 'дом', 'участок']);
const propertyModes: ReadonlyArray<[PropertyListingMode, readonly string[]]> = [
  ['daily', ['de inchiriat pe zi', 'chirie pe zi', 'pe noapte', 'daily rent', 'short term rent', 'посуточно', 'на сутки']],
  ['monthly', ['de inchiriat lunar', 'chirie lunara', 'chirie lunară', 'de inchiriat', 'inchiriere', 'chirie', 'monthly rent', 'long term rent', 'rent', 'rental', 'for rent', 'аренда', 'снять', 'сдается', 'сдаётся']],
  ['sale', ['de vanzare', 'vanzare', 'vand', 'buy', 'for sale', 'продажа', 'купить', 'продам']],
];
const propertySectors: ReadonlyArray<[string, readonly string[]]> = [
  ['Aeroport', ['aeroport']],
  ['Botanica', ['botanica']],
  ['Buiucani', ['buiucani']],
  ['Centru', ['centru', 'center', 'центр']],
  ['Ciocana', ['ciocana']],
  ['Poșta Veche', ['posta veche', 'poșta veche']],
  ['Râșcani', ['rascani', 'râșcani', 'рышкановка']],
  ['Sculeni', ['sculeni']],
  ['Telecentru', ['telecentru']],
];

const fuels: ReadonlyArray<[string, readonly string[]]> = [
  ['Benzină', ['petrol', 'gasoline', 'benzina', 'benzină', 'бензин']],
  ['Diesel', ['diesel', 'дизель']],
  ['Hybrid', ['hybrid', 'hibrid', 'гибрид']],
  ['Electricitate', ['electric', 'electrica', 'electrică', 'ev', 'электро', 'электричество']],
  ['Gaz', ['gaz', 'lpg', 'gpl', 'propan', 'metan', 'газ']],
];
const transmissions: ReadonlyArray<[string, readonly string[]]> = [
  ['Automată', ['automatic', 'automata', 'automată', 'automat', 'автомат', 'автоматическая']],
  ['Mecanică', ['manual', 'manuala', 'manuală', 'mecanic', 'mecanica', 'mecanică', 'механика', 'ручная']],
  ['Variator', ['cvt', 'variator', 'вариатор']],
  ['Robotizată', ['robotized', 'robotizata', 'robotizată', 'робот']],
];
const drivetrains: ReadonlyArray<[string, readonly string[]]> = [
  ['4x4', ['4x4', 'awd', 'tractiune integrala', 'полный привод']],
  ['Din față', ['fwd', 'tractiune fata', 'front wheel drive', 'передний привод']],
  ['Din spate', ['rwd', 'tractiune spate', 'rear wheel drive', 'задний привод']],
];
const bodyTypes: ReadonlyArray<[string, readonly string[]]> = [
  ['Sedan', ['sedan', 'седан']], ['SUV', ['suv', 'внедорожник']], ['Crossover', ['crossover', 'кроссовер']],
  ['Hatchback', ['hatchback', 'хэтчбек']], ['Universal', ['wagon', 'estate', 'universal', 'универсал']],
  ['Coupe', ['coupe', 'купе']], ['Minivan', ['minivan', 'минивэн']],
];
const registrations: ReadonlyArray<['moldova' | 'other', readonly string[]]> = [
  ['other', ['alta inmatriculare', 'inmatriculare straina', 'numere straine', 'foreign registration', 'foreign plates', 'иностранная регистрация', 'иностранные номера']],
  ['moldova', ['inmatriculata in republica moldova', 'inmatriculat in republica moldova', 'inmatriculare republica moldova', 'inmatriculata in moldova', 'inmatriculat in moldova', 'inmatriculare moldova', 'numere moldovenesti', 'moldova registration', 'registered in moldova', 'moldovan plates', 'молдавская регистрация', 'молдавские номера', 'inmatriculata', 'inmatriculat', 'inmatriculare']],
];

export function parseSearchIntent(input: string): SearchIntent {
  const original = input.trim();
  const plain = fold(original);
  const words = tokens(plain);
  const kind: SearchKind = words.includes('iphone')
    ? 'iphone'
    : words.some((word) => /^ps[1-5]$/.test(word)) || words.includes('playstation')
      ? 'playstation'
      : words.some((word) => laptopWords.has(word))
        ? 'laptop'
        : words.some((word) => tvWords.has(word)) || plain.includes('smart tv')
          ? 'tv'
          : words.some((word) => phoneWords.has(word))
            ? 'phone'
            : words.some((word) => propertyWords.has(word))
              ? 'realEstate'
      : words.some((word) => vehicleMakes.has(word) || vehicleModels.has(word) || vehicleWords.has(word)) || vehiclePhrases.some((phrase) => plain.includes(phrase))
        ? 'vehicle'
        : 'generic';

  const yearMatch = kind === 'vehicle' ? plain.match(/\b(19[5-9]\d|20[0-3]\d)(?:\s*(?:-|–|—|to|pana la)\s*(19[5-9]\d|20[0-3]\d))?\b/) : null;
  const modelPattern = kind === 'iphone'
    ? /\biphone\s*(\d{1,2})(?:\s*(?:-|–|—|to)\s*(\d{1,2}))?\b/
    : kind === 'playstation'
      ? /\b(?:playstation\s*|ps)([1-5])(?:\s*(?:-|–|—|to)\s*([1-5]))?\b/
      : null;
  const modelMatch = modelPattern ? plain.match(modelPattern) : null;
  const ramMatch = kind === 'laptop' || kind === 'phone'
    ? plain.match(/(?:\bram\s*)?(\d{1,3})(?:\s*(?:-|–|—|to)\s*(\d{1,3}))?\s*gb\s*(?:ram\b|memory\b|memorie\b)|\bram\s*(\d{1,3})\s*gb\b/)
    : null;
  const storageSource = ramMatch ? plain.replace(ramMatch[0], ' ') : plain;
  const storageMatch = ['iphone', 'phone', 'playstation', 'laptop'].includes(kind)
    ? storageSource.match(/\b(\d{1,4})\s*(gb|g|tb)?(?:\s*(?:-|–|—|to)\s*(\d{1,4}))?\s*(gb|g|tb)\b/)
    : null;
  const roomsMatch = kind === 'realEstate' ? plain.match(/(?:^|\s)(\d{1,2})(?:\s*(?:-|–|—|to)\s*(\d{1,2}))?\s*(?:camere?|rooms?|комнат\p{L}*)(?=\s|$)/u) : null;
  const areaMatch = kind === 'realEstate' ? plain.match(/(?:^|\s)(\d{1,4})(?:\s*(?:-|–|—|to)\s*(\d{1,4}))?\s*(?:m2|m²|mp|metri patrati|кв\.?\s*м)(?=\s|$)/u) : null;
  const screenMatch = ['laptop', 'phone', 'tv'].includes(kind) ? plain.match(/(?:^|\s)(\d{1,3}(?:[.,]\d)?)(?:\s*(?:-|–|—|to)\s*(\d{1,3}(?:[.,]\d)?))?\s*(?:inch(?:es)?|țoli|toli|дюйм\p{L}*|")(?=\s|$)/u) : null;
  const mileage = kind === 'vehicle' ? unitRangeIn(plain, '(?:km|kilometri?|км)', ['rulaj', 'kilometraj', 'mileage', 'odometer', 'пробег']) : emptyDetectedRange();
  const power = kind === 'vehicle' ? unitRangeIn(plain, '(?:hp|cp|cai putere|л\\.?с\\.?)', ['putere', 'power', 'мощность']) : emptyDetectedRange();
  // A bare "under 120k" is a valid price expression, but not when it is
  // immediately followed by km/hp. Remove detected measurements first so the
  // same number can never become both a vehicle facet and a budget.
  const priceSource = [mileage.match, power.match].filter(Boolean).reduce((value, match) => value.replace(match, ' '), plain);
  const price = priceIn(priceSource);
  const exclusions = exclusionsIn(plain);
  const fuel = kind === 'vehicle' ? detectedChoice(plain, fuels) : null;
  const transmission = kind === 'vehicle' ? detectedChoice(plain, transmissions) : null;
  const drivetrain = kind === 'vehicle' ? detectedPhraseChoice(plain, drivetrains) : null;
  const bodyType = kind === 'vehicle' ? detectedPhraseChoice(plain, bodyTypes) : null;
  const registration = kind === 'vehicle' ? detectedPhraseChoice(plain, registrations) : null;
  const listingMode = kind === 'realEstate' ? detectedPhraseChoice(plain, propertyModes) : null;
  const propertySector = kind === 'realEstate' ? detectedPhraseChoice(plain, propertySectors) : null;
  const condition = kind === 'realEstate'
    ? null
    : tokens(plain).some((word) => ['new', 'nou', 'noua', 'sigilat', 'sealed', 'новый', 'новая'].includes(word))
      ? 'new'
      : tokens(plain).some((word) => ['used', 'uzat', 'rulaj', 'бу', 'подержанный'].includes(word)) || plain.includes('second hand') || plain.includes('б/у')
        ? 'used'
        : null;
  const tags = kind === 'iphone'
    ? ['pro', 'max', 'plus', 'mini', 'air'].filter((tag) => words.includes(tag))
    : kind === 'playstation'
      ? ['slim', 'pro', 'digital', 'disc'].filter((tag) => words.includes(tag) || (tag === 'disc' && words.includes('disk')))
      : [];

  let sourceQuery = plain;
  if (yearMatch) sourceQuery = sourceQuery.replace(yearMatch[0], ' ');
  if (modelMatch?.[2]) sourceQuery = sourceQuery.replace(modelMatch[0], kind === 'iphone' ? 'iphone' : 'playstation');
  if (storageMatch) sourceQuery = sourceQuery.replace(storageMatch[0], ' ');
  if (ramMatch) sourceQuery = sourceQuery.replace(ramMatch[0], ' ');
  if (roomsMatch) sourceQuery = sourceQuery.replace(roomsMatch[0], ' ');
  if (areaMatch) sourceQuery = sourceQuery.replace(areaMatch[0], ' ');
  if (screenMatch) sourceQuery = sourceQuery.replace(screenMatch[0], ' ');
  if (mileage.match) sourceQuery = sourceQuery.replace(mileage.match, ' ');
  if (power.match) sourceQuery = sourceQuery.replace(power.match, ' ');
  if (price.match) sourceQuery = sourceQuery.replace(price.match, ' ');
  sourceQuery = sourceQuery.replace(/\b(?:mdl|lei|leu|леи|eur|euro|евро|usd|dolari?|dollars?|доллар(?:ов|а)?)\b|[€$]/g, ' ');
  sourceQuery = sourceQuery.replace(/(?:^|\s)(?:леи|евро|доллар(?:ов|а)?)(?=\s|$)/gu, ' ');
  for (const exclusion of exclusions) {
    sourceQuery = sourceQuery
      .replace(new RegExp(`(?:^|\\s)-${escapePattern(exclusion)}(?=\\s|$)`, 'gu'), ' ')
      .replace(new RegExp(`(?:^|\\s)(?:without|exclude|excluding|fara|без)\\s+${escapePattern(exclusion)}(?=\\s|$)`, 'gu'), ' ');
  }
  for (const tag of tags) sourceQuery = removeWord(sourceQuery, tag === 'disc' ? ['disc', 'disk'] : [tag]);
  if (kind === 'vehicle') {
    for (const [, aliases] of [...fuels, ...transmissions]) sourceQuery = removeWord(sourceQuery, aliases);
    sourceQuery = removePhrase(sourceQuery, [...drivetrains, ...bodyTypes].flatMap(([, aliases]) => aliases));
    if (registration) sourceQuery = removePhrase(sourceQuery, registrations.find(([value]) => value === registration)?.[1] ?? []);
  }
  if (kind === 'realEstate' && listingMode) {
    sourceQuery = removePhrase(sourceQuery, propertyModes.find(([mode]) => mode === listingMode)?.[1] ?? []);
  }
  if (condition === 'new') sourceQuery = removeWord(sourceQuery, ['new', 'nou', 'noua', 'sigilat', 'sealed', 'новый', 'новая']);
  if (condition === 'used') sourceQuery = removeWord(sourceQuery, ['used', 'uzat', 'rulaj', 'second', 'hand', 'бу', 'подержанный', 'б', 'у']);

  return {
    kind,
    sourceQuery: clean(sourceQuery) || (kind === 'vehicle' ? 'autoturism' : original),
    year: matchRange(yearMatch),
    generation: matchRange(modelMatch),
    storage: storageRange(storageMatch),
    ram: ramRange(ramMatch),
    rooms: decimalRange(roomsMatch),
    area: decimalRange(areaMatch),
    screen: decimalRange(screenMatch),
    mileage: mileage.range,
    power: power.range,
    price: price.range,
    currency: price.currency,
    fuel,
    transmission,
    drivetrain,
    bodyType,
    registration,
    condition,
    listingMode,
    propertySector,
    tags,
    exclusions,
  };
}

export function fold(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function storageIn(value: string): number | null {
  const match = fold(value).match(/\b(\d{2,4})\s*(gb|g|tb)\b/);
  if (!match) return null;
  return Number(match[1]) * (match[2] === 'tb' ? 1024 : 1);
}

export function generationIn(value: string, kind: SearchKind): number | null {
  const plain = fold(value);
  const match = kind === 'iphone' ? plain.match(/iphone\s*(\d{1,2})/) : plain.match(/(?:playstation\s*|ps)([1-5])/);
  return match ? Number(match[1]) : null;
}

function matchRange(match: RegExpMatchArray | null): NumberRange {
  if (!match) return { from: null, to: null };
  const from = Number(match[1]);
  return match[2] ? orderedRange(from, Number(match[2])) : { from, to: from };
}

function storageRange(match: RegExpMatchArray | null): NumberRange {
  if (!match) return { from: null, to: null };
  const from = Number(match[1]) * ((match[2] || match[4]) === 'tb' ? 1024 : 1);
  return match[3] ? orderedRange(from, Number(match[3]) * (match[4] === 'tb' ? 1024 : 1)) : { from, to: from };
}

function ramRange(match: RegExpMatchArray | null): NumberRange {
  if (!match) return { from: null, to: null };
  const from = Number(match[1] || match[3]);
  return match[2] ? orderedRange(from, Number(match[2])) : { from, to: from };
}

function decimalRange(match: RegExpMatchArray | null): NumberRange {
  if (!match) return { from: null, to: null };
  const from = Number(match[1].replace(',', '.'));
  return match[2] ? orderedRange(from, Number(match[2].replace(',', '.'))) : { from, to: from };
}

function detectedChoice(value: string, choices: ReadonlyArray<[string, readonly string[]]>): string | null {
  return choices.find(([, aliases]) => aliases.some((alias) => tokens(value).includes(fold(alias))))?.[0] ?? null;
}

function detectedPhraseChoice<T extends string>(value: string, choices: ReadonlyArray<[T, readonly string[]]>): T | null {
  return choices.find(([, aliases]) => aliases.some((alias) => containsWords(value, fold(alias))))?.[0] ?? null;
}

function containsWords(value: string, phrase: string): boolean {
  return new RegExp(`(?:^|\\s)${escapePattern(phrase).replace(/ /g, '\\s+')}(?=\\s|$)`, 'u').test(value);
}

function removePhrase(value: string, aliases: readonly string[]): string {
  return aliases.reduce((result, alias) => result.replace(new RegExp(`(?:^|\\s)${escapePattern(fold(alias)).replace(/ /g, '\\s+')}(?=\\s|$)`, 'gu'), ' '), value);
}

function priceIn(value: string): { range: NumberRange; currency: number | null; match: string } {
  const amount = String.raw`([\d.,]+(?:\s*[km](?!\p{L}))?)`;
  const unit = String.raw`(mdl|lei|leu|леи|euro|eur|евро|usd|dolari?|dollars?|доллар(?:ов|а)?|€|\$)`;
  const range = value.match(new RegExp(`${amount}\\s*(?:-|–|—|to)\\s*${amount}\\s*${unit}(?=\\s|$)`, 'u'));
  if (range) return {
    range: orderedRange(parseAmount(range[1]), parseAmount(range[2])),
    currency: currencyCode(range[3]),
    match: range[0],
  };
  const maximum = value.match(new RegExp(`(?:under|below|up to|max(?:imum)?|budget|sub|pana la|до)\\s*${amount}(?:\\s*${unit})?(?=\\s|$)`, 'u'));
  if (maximum) return { range: { from: null, to: parseAmount(maximum[1]) }, currency: currencyCode(maximum[2]), match: maximum[0] };
  const minimum = value.match(new RegExp(`(?:over|above|from|min(?:imum)?|peste|de la|от)\\s*${amount}(?:\\s*${unit})?(?=\\s|$)`, 'u'));
  if (minimum) return { range: { from: parseAmount(minimum[1]), to: null }, currency: currencyCode(minimum[2]), match: minimum[0] };
  return { range: { from: null, to: null }, currency: currencyCode(value.match(new RegExp(unit, 'u'))?.[1]), match: '' };
}

function emptyDetectedRange(): { range: NumberRange; match: string } { return { range: { from: null, to: null }, match: '' }; }

function unitRangeIn(value: string, unit: string, labels: readonly string[]): { range: NumberRange; match: string } {
  const amount = String.raw`([\d.,]+(?:\s*k(?!\p{L}))?)`;
  const label = labels.map(escapePattern).join('|');
  const range = value.match(new RegExp(`(?:${label})?\\s*${amount}\\s*(?:-|–|—|to|pana la)\\s*${amount}\\s*${unit}(?=\\s|$)`, 'u'));
  if (range) return { range: orderedRange(parseAmount(range[1]), parseAmount(range[2])), match: range[0] };
  const maximum = value.match(new RegExp(`(?:(?:${label})\\s*)?(?:under|below|up to|max(?:imum)?|sub|pana la|до)\\s*${amount}\\s*${unit}(?=\\s|$)`, 'u'));
  if (maximum) return { range: { from: null, to: parseAmount(maximum[1]) }, match: maximum[0] };
  const minimum = value.match(new RegExp(`(?:(?:${label})\\s*)?(?:over|above|from|min(?:imum)?|peste|de la|от)\\s*${amount}\\s*${unit}(?=\\s|$)`, 'u'));
  if (minimum) return { range: { from: parseAmount(minimum[1]), to: null }, match: minimum[0] };
  const exact = value.match(new RegExp(`(?:(?:${label})\\s*)?${amount}\\s*${unit}(?=\\s|$)`, 'u'));
  return exact ? { range: { from: parseAmount(exact[1]), to: parseAmount(exact[1]) }, match: exact[0] } : emptyDetectedRange();
}

function exclusionsIn(value: string): string[] {
  const found = new Set<string>();
  for (const match of value.matchAll(/(?:^|\s)-([\p{L}\p{N}][\p{L}\p{N}-]{1,30})(?=\s|$)/gu)) found.add(match[1]);
  for (const match of value.matchAll(/(?:^|\s)(?:without|exclude|excluding|fara|без)\s+([\p{L}\p{N}][\p{L}\p{N}-]{1,30})(?=\s|$)/gu)) found.add(match[1]);
  return [...found];
}

function parseAmount(value: string): number {
  const compact = value.replace(/\s/g, '').toLowerCase();
  const multiplier = compact.endsWith('k') ? 1_000 : compact.endsWith('m') ? 1_000_000 : 1;
  const numeric = compact.replace(/[km]$/, '');
  const normalized = multiplier > 1 ? numeric.replace(',', '.') : numeric.replace(/[.,](?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  return Math.max(0, Math.round((Number(normalized) || 0) * multiplier));
}

function currencyCode(value?: string): number | null {
  if (!value) return null;
  const unit = fold(value);
  if (['mdl', 'lei', 'leu', 'леи', 'лей'].includes(unit)) return 0;
  if (['eur', 'euro', 'евро'].includes(unit) || value === '€') return 1;
  return 2;
}

function orderedRange(from: number, to: number): NumberRange { return from <= to ? { from, to } : { from: to, to: from }; }
function escapePattern(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function removeWord(value: string, words: readonly string[]): string {
  return tokens(value).filter((word) => !words.includes(word)).join(' ');
}

function tokens(value: string): string[] { return fold(value).match(/[\p{L}\p{N}]+/gu) ?? []; }
function clean(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
