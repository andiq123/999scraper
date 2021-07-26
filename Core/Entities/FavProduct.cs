using System;
using static Core.Enums.Enum;

namespace Core.Entities
{
    public class FavProduct
    {
        public Guid Id { get; set; }
        public string Title { get; set; }
        public string ThumbnailURL { get; set; }
        public string Description { get; set; }
        public int? Price { get; set; }
        public string PriceString { get; set; }
        public Currencies Currency { get; set; }
        public bool IsBoosted { get; set; }
        public string UrlToProduct { get; set; }
        public bool IsGood { get; set; }
    }
}