using System;
using System.Collections.Generic;

namespace Core.Entities
{
    public class ProductsContainer
    {
        public ProductsContainer() { }
        public ProductsContainer(IReadOnlyList<Product> products)
        {
            Id = GenerateRandomId();
            Products = products;
        }

        public string Id { get; set; }
        public IReadOnlyList<Product> Products { get; set; }

        private string GenerateRandomId()
        {
            var letters = "abcdefghjklmnopqrswyz";
            var digits = "1234567890";
            var idToReturn = "";
            for (int i = 0; i < 5; i++)
            {
                for (int j = 0; j < 4; j++)
                {
                    var digitOrLetter = new Random().Next(0, 3);
                    if (digitOrLetter == 1)
                    {
                        idToReturn += digits[new Random().Next(0, digits.Length)];
                    }
                    else
                    {
                        idToReturn += letters[new Random().Next(0, letters.Length)];
                    }
                }
                if (i < 4)
                    idToReturn += "-";
            }
            return idToReturn;
        }
    }
}