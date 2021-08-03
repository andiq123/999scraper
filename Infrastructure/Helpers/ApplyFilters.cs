using Core.Entities;
using System.Collections.Generic;
using System.Linq;

namespace Infrastructure.Helpers
{
    public class ApplyFilters
    {
        public static IReadOnlyList<Product> FilterListOfProducts(IReadOnlyList<Product> products, Filters filters)
        {
            try
            {
                if (filters.ExcludeOtherAds)
                {
                    products = products.Where(x => x.Title.ToLower().Contains(filters.ProductSearchCriteria.ToLower())).ToList();
                }
            }
            catch (System.Exception ex)
            {
                System.Console.WriteLine(filters.ProductSearchCriteria);
                System.Console.WriteLine(ex.Message, ex.StackTrace);
            }


            if (filters.ExcludeBoosted)
            {
                products = products.Where(x => !x.IsBoosted).ToList();
            }

            if (filters.ExcludePriceNegotiable)
            {
                products = products.Where(x => string.IsNullOrEmpty(x.PriceString)).ToList();
            }



            if (filters.keysToExclude.Count > 0)
            {
                products = products.Where(x =>
                {
                    foreach (var word in filters.keysToExclude)
                    {
                        if (x.Title.ToLower().Contains(word.ToLower()))
                        {
                            return false;
                        }
                    }
                    return true;
                }).ToList();
            }

            if (!string.IsNullOrEmpty(filters.Order) && filters.Order == "priceAsc")
            {
                products = products.OrderBy(x => x.Price).ToList();
            }

            if (!string.IsNullOrEmpty(filters.Order) && filters.Order == "priceDesc")
            {
                products = products.OrderByDescending(x => x.Price).ToList();
            }

            return products;
        }
    }
}
