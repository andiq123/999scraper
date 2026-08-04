export interface VehicleBrand {
  canonical: string;
  aliases: readonly string[];
  models: readonly string[];
}

/**
 * Marketplace-oriented vehicle vocabulary. Keep recognition here so intent,
 * autocomplete and suggestions cannot drift into separate hard-coded lists.
 *
 * Models are useful for suggestions. Only distinctive model names are allowed
 * to classify a query by themselves; short names such as "X", "01" or "Seal"
 * require their make to avoid turning unrelated searches into car searches.
 */
export const vehicleCatalog: readonly VehicleBrand[] = [
  { canonical: 'Acura', aliases: ['acura'], models: ['MDX', 'RDX', 'TLX'] },
  { canonical: 'Alfa Romeo', aliases: ['alfa romeo'], models: ['Giulia', 'Giulietta', 'Stelvio'] },
  { canonical: 'Audi', aliases: ['audi'], models: ['A4', 'A6', 'Q5', 'Q7', 'e-tron'] },
  { canonical: 'BMW', aliases: ['bmw'], models: ['X3', 'X5', 'X6', 'i4', 'iX'] },
  { canonical: 'Cadillac', aliases: ['cadillac'], models: ['Escalade', 'XT5'] },
  { canonical: 'Chevrolet', aliases: ['chevrolet', 'chevy'], models: ['Aveo', 'Bolt', 'Captiva', 'Cruze'] },
  { canonical: 'Chrysler', aliases: ['chrysler'], models: ['200', '300', 'Pacifica', 'Voyager'] },
  { canonical: 'Citroën', aliases: ['citroen', 'citroën'], models: ['C3', 'C4', 'C5 Aircross'] },
  { canonical: 'Dacia', aliases: ['dacia'], models: ['Duster', 'Logan', 'Sandero', 'Spring'] },
  { canonical: 'Daewoo', aliases: ['daewoo'], models: ['Lanos', 'Matiz', 'Nubira'] },
  { canonical: 'Dodge', aliases: ['dodge'], models: ['Challenger', 'Charger', 'Journey', 'Ram'] },
  { canonical: 'Fiat', aliases: ['fiat'], models: ['500', 'Doblo', 'Panda', 'Tipo'] },
  { canonical: 'Ford', aliases: ['ford'], models: ['Focus', 'Kuga', 'Mondeo', 'Mustang Mach-E'] },
  { canonical: 'Honda', aliases: ['honda'], models: ['Accord', 'Civic', 'CR-V', 'HR-V'] },
  { canonical: 'Hyundai', aliases: ['hyundai'], models: ['Elantra', 'IONIQ 5', 'Santa Fe', 'Tucson'] },
  { canonical: 'Infiniti', aliases: ['infiniti'], models: ['FX', 'Q50', 'QX50', 'QX60'] },
  { canonical: 'Jaguar', aliases: ['jaguar'], models: ['E-Pace', 'F-Pace', 'I-Pace', 'XF'] },
  { canonical: 'Jeep', aliases: ['jeep'], models: ['Cherokee', 'Compass', 'Grand Cherokee', 'Renegade'] },
  { canonical: 'Kia', aliases: ['kia'], models: ['EV6', 'Niro', 'Sorento', 'Sportage'] },
  { canonical: 'Lexus', aliases: ['lexus'], models: ['ES', 'NX', 'RX', 'UX'] },
  { canonical: 'Land Rover', aliases: ['land rover'], models: ['Defender', 'Discovery', 'Range Rover', 'Range Rover Sport'] },
  { canonical: 'Mazda', aliases: ['mazda'], models: ['CX-5', 'CX-60', 'Mazda 3', 'Mazda 6'] },
  { canonical: 'Mercedes-Benz', aliases: ['mercedes', 'mercedes benz', 'mercedes-benz'], models: ['C-Class', 'E-Class', 'GLC', 'GLE'] },
  { canonical: 'Mitsubishi', aliases: ['mitsubishi'], models: ['ASX', 'Outlander', 'Pajero'] },
  { canonical: 'Nissan', aliases: ['nissan'], models: ['Juke', 'Leaf', 'Qashqai', 'X-Trail'] },
  { canonical: 'Opel', aliases: ['opel'], models: ['Astra', 'Corsa', 'Insignia', 'Mokka'] },
  { canonical: 'Peugeot', aliases: ['peugeot'], models: ['208', '3008', '5008', 'Partner'] },
  { canonical: 'Porsche', aliases: ['porsche'], models: ['Cayenne', 'Macan', 'Taycan'] },
  { canonical: 'Renault', aliases: ['renault'], models: ['Captur', 'Kadjar', 'Megane', 'Zoe'] },
  { canonical: 'SEAT', aliases: ['seat auto', 'seat'], models: ['Ateca', 'Ibiza', 'Leon', 'Tarraco'] },
  { canonical: 'Škoda', aliases: ['skoda', 'škoda'], models: ['Kodiaq', 'Octavia', 'Superb'] },
  { canonical: 'SsangYong', aliases: ['ssangyong', 'kgm'], models: ['Korando', 'Rexton', 'Tivoli', 'Torres'] },
  { canonical: 'Subaru', aliases: ['subaru'], models: ['Forester', 'Outback', 'XV'] },
  { canonical: 'Suzuki', aliases: ['suzuki'], models: ['S-Cross', 'Swift', 'Vitara'] },
  { canonical: 'Tesla', aliases: ['tesla'], models: ['Model 3', 'Model S', 'Model X', 'Model Y'] },
  { canonical: 'Toyota', aliases: ['toyota'], models: ['Camry', 'Corolla', 'Land Cruiser', 'Prius', 'RAV4'] },
  { canonical: 'Volkswagen', aliases: ['volkswagen', 'vw'], models: ['Golf', 'ID.4', 'Passat', 'Tiguan', 'Touareg'] },
  { canonical: 'Volvo', aliases: ['volvo'], models: ['EX30', 'XC40', 'XC60', 'XC90'] },

  // Chinese makes currently common in the 999.md marketplace and region.
  { canonical: 'Aito', aliases: ['aito', 'seres aito'], models: ['M5', 'M7', 'M8', 'M9'] },
  { canonical: 'Aiways', aliases: ['aiways'], models: ['U5', 'U6'] },
  { canonical: 'Arcfox', aliases: ['arcfox', 'arc fox'], models: ['Alpha S', 'Alpha T', 'Kaola'] },
  { canonical: 'Avatr', aliases: ['avatr'], models: ['Avatr 06', 'Avatr 07', 'Avatr 11', 'Avatr 12'] },
  { canonical: 'BAIC', aliases: ['baic'], models: ['BJ40', 'X35', 'X55', 'X7'] },
  { canonical: 'BAW', aliases: ['baw'], models: ['212', 'Brumby', 'Pony'] },
  { canonical: 'Brilliance', aliases: ['brilliance'], models: ['H530', 'V3', 'V5'] },
  { canonical: 'BYD', aliases: ['byd', 'build your dreams'], models: ['Atto 2', 'Atto 3', 'Dolphin', 'Dolphin Surf', 'Han', 'Qin Plus', 'Seal', 'Seal U', 'Sealion 5', 'Sealion 6', 'Sealion 7', 'Song Plus', 'Song Pro', 'Tang', 'Yuan Plus'] },
  { canonical: 'Cenntro', aliases: ['cenntro'], models: ['Logistar 100', 'Logistar 200', 'Metro'] },
  { canonical: 'Changan', aliases: ['changan'], models: ['CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'UNI-K', 'UNI-T', 'UNI-V'] },
  { canonical: 'Chery', aliases: ['chery'], models: ['Arrizo 5', 'Arrizo 8', 'Tiggo 2', 'Tiggo 4', 'Tiggo 7', 'Tiggo 7 Pro', 'Tiggo 8', 'Tiggo 8 Pro', 'Tiggo 9'] },
  { canonical: 'Deepal', aliases: ['deepal', 'shenlan'], models: ['S05', 'S07', 'SL03'] },
  { canonical: 'Denza', aliases: ['denza'], models: ['D9', 'N7', 'N8', 'Z9 GT'] },
  { canonical: 'Dongfeng', aliases: ['dongfeng'], models: ['Aeolus', 'Forthing T5 Evo', 'Mage', 'Shine'] },
  { canonical: 'Exeed', aliases: ['exeed'], models: ['Exlantix ES', 'Exlantix ET', 'LX', 'RX', 'TXL', 'VX'] },
  { canonical: 'FAW Bestune', aliases: ['faw', 'bestune', 'faw bestune'], models: ['B70', 'T55', 'T77', 'T90'] },
  { canonical: 'GAC', aliases: ['gac', 'gac motor'], models: ['Aion S', 'Aion V', 'Aion Y', 'GS3', 'GS8', 'Hyptec HT'] },
  { canonical: 'Geely', aliases: ['geely'], models: ['Atlas', 'Atlas Pro', 'Coolray', 'Emgrand', 'Galaxy E5', 'Galaxy L7', 'Geometry C', 'Monjaro', 'Tugella'] },
  { canonical: 'Great Wall', aliases: ['great wall', 'gwm'], models: ['Ora 03', 'Poer', 'Wingle'] },
  { canonical: 'Haima', aliases: ['haima'], models: ['7X', '8S', 'S5'] },
  { canonical: 'Haval', aliases: ['haval'], models: ['Dargo', 'F7', 'H5', 'H6', 'H9', 'Jolion', 'M6'] },
  { canonical: 'HiPhi', aliases: ['hiphi', 'hi phi'], models: ['X', 'Y', 'Z'] },
  { canonical: 'Hongqi', aliases: ['hongqi'], models: ['E-HS9', 'H5', 'H9', 'HS5'] },
  { canonical: 'Neta', aliases: ['neta', 'hozon', 'hozon auto'], models: ['Aya', 'GT', 'L', 'S', 'U', 'V'] },
  { canonical: 'IM Motors', aliases: ['im motors', 'im auto', 'zhiji'], models: ['L6', 'L7', 'LS6', 'LS7'] },
  { canonical: 'JAC', aliases: ['jac'], models: ['J7', 'JS4', 'JS6', 'T8'] },
  { canonical: 'JMC', aliases: ['jmc'], models: ['Baodian', 'Vigus', 'Yuhu'] },
  { canonical: 'Jaecoo', aliases: ['jaecoo'], models: ['J7', 'J8'] },
  { canonical: 'Jetour', aliases: ['jetour'], models: ['Dashing', 'G700', 'T1', 'T1 i-DM', 'T2', 'T2 i-DM', 'X50', 'X70', 'X70 Plus', 'X90', 'X90 Plus', 'X95'] },
  { canonical: 'Leapmotor', aliases: ['leapmotor'], models: ['C10', 'C11', 'C16', 'T03'] },
  { canonical: 'Li Auto', aliases: ['li auto', 'lixiang', 'li xiang'], models: ['L6', 'L7', 'L8', 'L9', 'Mega'] },
  { canonical: 'Lifan', aliases: ['lifan'], models: ['Myway', 'Solano', 'X50', 'X60'] },
  { canonical: 'Linktour', aliases: ['linktour', 'link tour'], models: ['K-One'] },
  { canonical: 'Lynk & Co', aliases: ['lynk and co', 'lynk & co', 'lynk co'], models: ['01', '02', '03', '05', '06', '08', '09', 'Z10'] },
  { canonical: 'Luxeed', aliases: ['luxeed'], models: ['R7', 'S7'] },
  { canonical: 'Maextro', aliases: ['maextro'], models: ['S800'] },
  { canonical: 'Maxus', aliases: ['maxus', 'saic maxus'], models: ['D60', 'D90', 'eDeliver 3', 'Euniq 5', 'Euniq 6', 'Mifa 9', 'T90'] },
  { canonical: 'MG', aliases: ['mg motor'], models: ['MG4', 'MG5', 'HS', 'ZS'] },
  { canonical: 'NIO', aliases: ['nio'], models: ['EL6', 'EL7', 'EL8', 'ES6', 'ES8', 'ET5', 'ET7'] },
  { canonical: 'Omoda', aliases: ['omoda'], models: ['C5', 'C7', 'E5', 'Omoda 5'] },
  { canonical: 'Ora', aliases: ['ora auto', 'gwm ora'], models: ['03', 'Funky Cat', 'Good Cat'] },
  { canonical: 'Oshan', aliases: ['oshan', 'changan oshan'], models: ['X5 Plus', 'X7 Plus', 'Z6'] },
  { canonical: 'Polar Stone', aliases: ['polar stone', 'rox motor', 'rox'], models: ['01'] },
  { canonical: 'Riddara', aliases: ['riddara', 'radar auto', 'geely radar'], models: ['RD6'] },
  { canonical: 'Roewe', aliases: ['roewe'], models: ['i5', 'i6', 'RX5'] },
  { canonical: 'Shuanghuan', aliases: ['shuanghuan'], models: ['SCEO'] },
  { canonical: 'Skywell', aliases: ['skywell'], models: ['ET5', 'HT-i'] },
  { canonical: 'Soueast', aliases: ['soueast'], models: ['DX7', 'S06', 'S07', 'S09'] },
  { canonical: 'Tank', aliases: ['tank auto', 'tank'], models: ['Tank 300', 'Tank 400', 'Tank 500', 'Tank 700'] },
  { canonical: 'Venucia', aliases: ['venucia'], models: ['D60', 'Star', 'V-Online'] },
  { canonical: 'Voyah', aliases: ['voyah'], models: ['Dream', 'Free', 'Passion'] },
  { canonical: 'Weltmeister', aliases: ['weltmeister', 'wm motor'], models: ['EX5', 'W6'] },
  { canonical: 'Wuling', aliases: ['wuling'], models: ['Air EV', 'Bingo', 'Hongguang Mini EV', 'Starlight'] },
  { canonical: 'XPeng', aliases: ['xpeng', 'x peng'], models: ['G3', 'G6', 'G9', 'Mona M03', 'P5', 'P7', 'X9'] },
  { canonical: 'Xiaomi', aliases: ['xiaomi auto', 'xiaomi car'], models: ['SU7', 'YU7'] },
  { canonical: 'Zeekr', aliases: ['zeekr'], models: ['001', '007', '009', '7X', 'Mix', 'X'] },
  { canonical: 'Zotye', aliases: ['zotye'], models: ['T600', 'T700', 'Z300'] },
  { canonical: 'iCar', aliases: ['icar', 'chery icar'], models: ['03', 'V23'] },

  { canonical: 'Lada', aliases: ['lada', 'лада', 'ваз'], models: ['Granta', 'Niva', 'Vesta'] },
  { canonical: 'GAZ', aliases: ['gaz auto', 'газ'], models: ['Gazelle'] },
  { canonical: 'UAZ', aliases: ['uaz', 'уаз'], models: ['Patriot'] },
] as const;

const distinctiveModels = [
  'atto 2', 'atto 3', 'coolray', 'dashing', 'dolphin surf', 'exlantix', 'forthing t5 evo',
  'galaxy e5', 'geometry c', 'jolion', 'land cruiser', 'leapmotor', 'model 3', 'model s',
  'model x', 'model y', 'monjaro', 'omoda 5', 'qin plus', 'range rover', 'sealion 5',
  'sealion 6', 'sealion 7', 'song plus', 'song pro', 'tiggo 2', 'tiggo 4', 'tiggo 7',
  'tiggo 8', 'tiggo 9', 'tugella', 'yuan plus', 'xiaomi su7', 'xiaomi yu7', 'mg4', 'mg5',
  'mg hs', 'mg zs', 'seat ateca', 'seat ibiza', 'seat leon', 'seat tarraco', 'x5', 'x6',
] as const;

const classicStandaloneModels = new Set([
  'camry', 'civic', 'corolla', 'duster', 'golf', 'logan', 'octavia', 'passat', 'prius',
  'qashqai', 'rav4', 'sandero', 'sportage', 'tucson',
]);

const ambiguousSingleWordMakes = new Set(['seat']);

const singleWordMakes = new Set(
  vehicleCatalog
    .flatMap((brand) => brand.aliases)
    .filter((alias) => /^\p{L}[\p{L}\p{N}-]*$/u.test(alias) && !ambiguousSingleWordMakes.has(alias)),
);
const makePhrases = vehicleCatalog.flatMap((brand) => brand.aliases).filter((alias) => alias.includes(' ') || alias.includes('&'));

export const vehicleEntityCompletions: ReadonlyArray<{ canonical: string; aliases: readonly string[] }> = vehicleCatalog.map((brand) => ({
  canonical: brand.canonical,
  aliases: brand.aliases,
}));

export const vehicleModelSearches: ReadonlyArray<{ value: string; label: string }> = vehicleCatalog.flatMap((brand) =>
  brand.models.map((model) => ({ value: `${brand.canonical} ${model}`, label: `${brand.canonical} ${model}` })),
);

export const popularChineseVehicleSearches = [
  'BYD Song Plus', 'BYD Atto 3', 'BYD Seal', 'Jetour T2', 'Jetour Dashing',
  'Geely Coolray', 'Geely Monjaro', 'Chery Tiggo 7 Pro', 'Haval Jolion', 'Zeekr 001',
] as const;

export function matchesVehicleCatalog(plain: string, words: readonly string[]): boolean {
  return words.some((word) => singleWordMakes.has(word) || classicStandaloneModels.has(word))
    || makePhrases.some((phrase) => containsPhrase(plain, phrase))
    || distinctiveModels.some((model) => containsPhrase(plain, model));
}

function containsPhrase(value: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(value);
}
