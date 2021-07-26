using System.Threading.Tasks;
using API.Hubs;
using Core.Entities;
using Core.Interfaces;
using Infrastructure.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace API.Controllers
{
    [Authorize]
    public class ProductsController : BaseApiController
    {
        private readonly IProductRepository _repo;
        private readonly IRedisRepository _redisRepository;
        private readonly IHubContext<ProgressHub> _hubContext;
        public ProductsController(IProductRepository repo, IRedisRepository redisRepository, IHubContext<ProgressHub> hubContext)
        {
            _hubContext = hubContext;
            _redisRepository = redisRepository;
            _repo = repo;
        }


        [HttpPost]
        public async Task<ActionResult<ProductsContainer>> GetAsync([FromBody] Filters filters)
        {
            _repo.ProgressChanged += async (object sender, ProgressReport args) =>
            {
                await _hubContext.Clients.All.SendAsync("ProgressChanged", args);
            };

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

    }
}