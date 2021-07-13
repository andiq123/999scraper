using Core.Entities;
using static Core.Enums.Enum;

namespace Infrastructure.Helpers
{
    public class CurrencyHelper
    {
        public static void DetermineCurrency(ref Product product, string priceText)
        {
            var priceNumbers = priceText.GetNumbersFromString();
            var currency = priceText.ExcludeNumbersFromString();
            if (currency.Contains("MDL") || currency.Contains("&nbsp;леев") || currency.Contains("леев"))
            {
                product.Price = priceNumbers;
                product.Currency = Currencies.MDL;
            }
            else if (currency.Contains("€") || currency.Contains("&nbsp;€"))
            {
                product.Price = priceNumbers;
                product.Currency = Currencies.Euro;
            }
            else
            {
                product.PriceString = "Price Negotiable";
            }
        }
    }
}