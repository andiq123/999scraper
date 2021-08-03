using API.Hubs;
using Core.Entities;
using Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace API.Controllers
{
    [Authorize]
    public class FavoritesController : BaseApiController
    {
        private readonly DataContext _context;
        private readonly IHubContext<UserAccountHub> _hubContext;

        public FavoritesController(DataContext context, IHubContext<UserAccountHub> hubContext)
        {
            _hubContext = hubContext;
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IReadOnlyList<FavProduct>>> GetFavoriteProductsAsync()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _context.Users.Include(x => x.Products).FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null) return NotFound(new { error = "User not found" });

            user.LastActive = DateTime.Now;
            await _context.SaveChangesAsync();
            await InvokeLastUpdatedAsync(user.Id, user.LastActive);
            return user.Products.ToList();
        }

        [HttpPost]
        public async Task<ActionResult> AddToFavoritesAsync([FromBody] Product product)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _context.Users.Include(x => x.Products).FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null) return NotFound(new { error = "User not found" });
            var userAlreadyHasThisProduct = user.Products.FirstOrDefault(x => x.Title.ToLower() == product.Title.ToLower());
            if (userAlreadyHasThisProduct != null) return BadRequest(new { error = "You already have this product." });
            var favProduct = MapProductToFavProduct(product);

            user.Products.Add(favProduct);

            user.LastActive = DateTime.Now;
            await InvokeLastUpdatedAsync(user.Id, user.LastActive);
            await _context.SaveChangesAsync();
            return Ok();
        }

        [HttpDelete("{productId}")]
        public async Task<ActionResult> RemoveFromFavoritesAsync(Guid productId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _context.Users.Include(x => x.Products).FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null) return NotFound(new { error = "User not found" });
            var product = user.Products.FirstOrDefault(x => x.Id == productId);
            if (product == null) return BadRequest(new { error = "You dont have this product." });
            user.Products.Remove(product);

            user.LastActive = DateTime.Now;
            await _context.SaveChangesAsync();
            await InvokeLastUpdatedAsync(user.Id, user.LastActive);
            return Ok();
        }

        private FavProduct MapProductToFavProduct(Product product)
        {
            return new FavProduct()
            {
                Title = product.Title,
                Description = product.Description,
                Price = product.Price,
                IsGood = product.IsGood,
                Currency = product.Currency,
                IsBoosted = product.IsBoosted,
                PriceString = product.PriceString,
                ThumbnailURL = product.ThumbnailURL,
                UrlToProduct = product.UrlToProduct,
            };
        }

        private async Task InvokeLastUpdatedAsync(string userId, DateTime time)
        {
            await _hubContext.Clients.All.SendAsync("LastActiveUpdated", new { userId = userId, lastActive = time });
        }
    }
}