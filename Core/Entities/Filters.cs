using System.Collections.Generic;

namespace Core.Entities
{
    public class Filters
    {
        public bool ExcludeBoosted { get; set; }
        public bool ExcludePriceNegotiable { get; set; }
        public bool ExcludeOtherAds { get; set; }

        public IList<string> keysToExclude { get; set; } = new List<string>();

        //order
        public string Order { get; set; } = "priceAsc";

        //redis id
        public string RedisId { get; set; }

        public string ProductSearchCriteria { get; set; }

        public string SignalRConnectionId { get; set; }
    }
}

//   excludeBoosted: boolean = false;
//   includePriceNegotiable: boolean = true;
//   excludeOtherAds: boolean = false;
//   orderBy: 'priceAsc' | 'priceDesc' = 'priceAsc';
//   keysToExclude: string[] = [];