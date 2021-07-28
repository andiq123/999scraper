export class Filters {
  excludeBoosted: boolean = false;
  excludePriceNegotiable: boolean = false;
  excludeOtherAds: boolean = true;
  order: 'priceAsc' | 'priceDesc' = 'priceAsc';
  keysToExclude: string[] = [];
  redisId: string = '';
  productSearchCriteria: string = '';
  signalRConnectionId: string = '';
}
