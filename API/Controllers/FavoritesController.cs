using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Core.Entities;
using Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers
{
    [Authorize]
    public class FavoritesController : BaseApiController
    {
        private readonly DataContext _context;

        public FavoritesController(DataContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IReadOnlyList<FavProduct>>> GetFavoriteProductsAsync()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _context.Users.Include(x => x.Products).FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null) return NotFound(new { error = "User not found" });
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
            await _context.SaveChangesAsync();
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
    }
}