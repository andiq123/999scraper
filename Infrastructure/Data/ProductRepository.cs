using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Core.Configs;
using Core.Entities;
using Core.Interfaces;
using Infrastructure.Helpers;

namespace Infrastructure.Data
{
    public class ProductRepository : IProductRepository
    {
        private readonly string _baseUrl;
        private readonly string _searchQuery;
        private readonly HttpClient _client;
        public event EventHandler<ProgressReport> ProgressChanged;

        public ProductRepository()
        {
            _baseUrl = Configs.GetBaseUrl();
            _searchQuery = Configs.GetSearchQuery();
            _client = new HttpClient();
        }



        public async Task<IReadOnlyList<Product>> GetProductsAsync(string productName, FiltersForUrl filters)
        {
            var url = _searchQuery + productName;
            url = url.AttribFiltersForUrl(filters);
            var document = await GetDocument.GetDocumentAsync(_client, url);
            int indexer = 0;
            List<Product> productList = new List<Product>();
            try
            {
                var paginationInformation = document.QuerySelector(".paginator");
                int totalPages = 0;
                try
                {
                    totalPages = Int32.Parse(paginationInformation.QuerySelector(".is-last-page").FirstElementChild.GetAttribute("href").Split("page=")[1]);
                }
                catch (Exception)
                {
                    var pagesCount = paginationInformation.QuerySelectorAll("li").Count();
                    totalPages = Int32.Parse(paginationInformation.QuerySelectorAll("li")[pagesCount - 1].FirstElementChild.GetAttribute("href").Split("page=")[1]);
                }
                for (int i = 1; i <= totalPages; i++)
                {
                    url = _searchQuery + productName + "&page=" + i;
                    url = url.AttribFiltersForUrl(filters);
                    document = await GetDocument.GetDocumentAsync(_client, url);
                    var rawProducts = document.QuerySelectorAll(".ads-list-detail-item   ");
                    populateTheList(ref productList, ref rawProducts, ref indexer);
                    var percentage = (int)Math.Round((decimal)i / totalPages * 100);
                    ProgressChanged.Invoke(this, new ProgressReport(i, totalPages, percentage));
                }
            }
            catch (System.Exception)
            {
                var rawProducts = document.QuerySelectorAll(".ads-list-detail-item   ");
                populateTheList(ref productList, ref rawProducts, ref indexer);
            }

            return productList;
        }

        private void populateTheList(ref List<Product> productList, ref AngleSharp.Dom.IHtmlCollection<AngleSharp.Dom.IElement> rawProducts, ref int indexer)
        {
            foreach (var product in rawProducts)
            {
                Product productOBJ = new Product();
                try
                {
                    productOBJ.Id = indexer;
                    var html = product.NodeValue;
                    productOBJ.Title = product.QuerySelector(".ads-list-detail-item-title ").FirstElementChild.TextContent.ToLower();

                    productOBJ.ThumbnailURL = product.QuerySelector(".ads-list-detail-item-thumb").FirstElementChild.FirstElementChild.GetAttribute("data-src");
                    productOBJ.UrlToProduct = _baseUrl + product.QuerySelector(".ads-list-detail-item-thumb").FirstElementChild.GetAttribute("href");
                    try
                    {
                        productOBJ.Description = product.QuerySelector(".ads-list-detail-item-intro").InnerHtml;
                    }
                    catch (Exception)
                    {
                        productOBJ.Description = "Not set";
                    }
                    try
                    {
                        var priceText = product.QuerySelector(" .ads-list-detail-item-price  ").TextContent;
                        CurrencyHelper.DetermineCurrency(ref productOBJ, priceText);
                    }
                    catch (Exception)
                    {
                        productOBJ.PriceString = "Price Negotiable";
                    }

                    try
                    {
                        productOBJ.IsBoosted = product.QuerySelector(".booster-label") != null;
                    }
                    catch (Exception)
                    {
                        productOBJ.IsBoosted = false;
                    }
                    productList.Add(productOBJ);
                    indexer++;
                }
                catch (System.Exception)
                {

                }
            }
        }
    }
}
