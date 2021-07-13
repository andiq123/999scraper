using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using Core.Entities;
using Core.Interfaces;
using Infrastructure.Helpers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly IProductRepository _repo;
        private readonly IRedisRepository _redisRepository;
        public ProductsController(IProductRepository repo, IRedisRepository redisRepository)
        {
            _redisRepository = redisRepository;
            _repo = repo;
        }

        [HttpPost]
        public async Task<ActionResult<ProductsContainer>> GetAsync([FromBody] Filters filters)
        {
            // _repo.ProgressChanged += async (object sender, ProgressReport args) =>
            // {

            // };

            if (!string.IsNullOrEmpty(filters.RedisId))
            {
                var productsFromRedis = await _redisRepository.GetContainerAsync(filters.RedisId);
                if (productsFromRedis != null)
                {
                    productsFromRedis.Products = ApplyFilters.FilterListOfProducts(productsFromRedis.Products, filters);
                    if (productsFromRedis.Products.Count == 0) return NotFound("No Products Found");
                    return Ok(productsFromRedis);
                }
            }

            var filtersForUrl = new FiltersForUrl();
            var products = await _repo.GetProductsAsync(filters.ProductSearchCriteria, filtersForUrl);
            if (products == null || products.Count == 0) return NotFound("No Products Found");
            var productsContainer = new ProductsContainer(products);
            var fromRedis = await _redisRepository.UpdateContainerAsync(productsContainer);
            fromRedis.Products = ApplyFilters.FilterListOfProducts(fromRedis.Products, filters);
            if (fromRedis.Products.Count == 0) return NotFound("No Products Found");

            return Ok(fromRedis);
        }



        [HttpGet("events")]
        public async Task<ActionResult<Product>> GetHttpEventsAsync()
        {
            string[] data = new string[] {
                "Hello World!",
                "Hello Galaxy!",
                "Hello Universe!"
            };



            for (int i = 0; i < data.Length; i++)
            {
                await Task.Delay(TimeSpan.FromSeconds(1));
                string dataItem = $"data: {data[i]}\n\n";
                byte[] dataItemBytes = Encoding.UTF8.GetBytes(dataItem);
                await Response.Body.WriteAsync(dataItemBytes, 0, dataItemBytes.Length);
                await Response.Body.FlushAsync();
                Response.Body.Close();
            }

            return Ok(new Product { Id = 1, Title = "grisha" });
        }
    }
}