using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using API.Hubs;
using Core.Entities;
using Core.Interfaces;
using Infrastructure.Data;
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
        private readonly IHubContext<ProgressHub> _progressContext;
        private readonly IHubContext<UserAccountHub> _userAccountContext;
        private readonly ActivityRepository _activityRepository;
        public ProductsController(IProductRepository repo,
                                    IRedisRepository redisRepository,
                                    IHubContext<ProgressHub> progressContext,
                                    IHubContext<UserAccountHub> userAccountContext,
                                    ActivityRepository activityRepository)
        {
            _activityRepository = activityRepository;
            _progressContext = progressContext;
            _userAccountContext = userAccountContext;
            _redisRepository = redisRepository;
            _repo = repo;
        }


        [HttpPost]
        public async Task<ActionResult<ProductsContainer>> GetAsync([FromBody] Filters filters, CancellationToken token)
        {
            if (!string.IsNullOrEmpty(filters.SignalRConnectionId))
            {
                _repo.ProgressChanged += async (object sender, ProgressReport args) =>
                {
                    await _progressContext.Clients.Client(filters.SignalRConnectionId).SendAsync("ProgressChanged", args);
                };
            }

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

            //logActivity
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var activity = await _activityRepository.AddActivityForUser(userId, filters.ProductSearchCriteria);
            await InvokeLastUpdatedAsync(userId, DateTime.Now);
            await InvokeActivityAddedAsync(userId, activity);


            var filtersForUrl = new FiltersForUrl();
            var products = await _repo.GetProductsAsync(filters.ProductSearchCriteria, filtersForUrl, token);
            if (products == null || products.Count == 0) return NotFound("No Products Found");
            var productsContainer = new ProductsContainer(products);
            var fromRedis = await _redisRepository.UpdateContainerAsync(productsContainer);
            fromRedis.Products = ApplyFilters.FilterListOfProducts(fromRedis.Products, filters);
            if (fromRedis.Products.Count == 0) return NotFound("No Products Found");

            return Ok(fromRedis);
        }

        private async Task InvokeLastUpdatedAsync(string userId, DateTime time)
        {
            await _userAccountContext.Clients.All.SendAsync("LastActiveUpdated", new { userId = userId, lastActive = time });
        }

        private async Task InvokeActivityAddedAsync(string userId, Activity activity)
        {
            await _userAccountContext.Clients.All.SendAsync("ActivityAdded", new { userId = userId, activity = activity });
        }

    }
}