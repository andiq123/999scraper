export class Filters {
  excludeBoosted: boolean = false;
  excludePriceNegotiable: boolean = false;
  excludeOtherAds: boolean = true;
  order: 'priceAsc' | 'priceDesc' = 'priceAsc';
  keysToExclude: string[] = [];
	productSearchCriteria: string = '';
}
