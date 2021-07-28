using System.Collections.Generic;
using System.Threading.Tasks;
using Infrastructure.IdentityEntities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Seed
{
    public static class SeedAdmin
    {
        public static async Task Seed(UserManager<AppUser> userManager, RoleManager<IdentityRole> roleManager)
        {
            if (!await userManager.Users.AnyAsync())
            {
                await roleManager.CreateAsync(new IdentityRole() { Id = "Asbdsac", Name = "Admin" });

                var user = new AppUser { Id = "asbdxz", Email = "Andi@gmail.com", UserName = "AndiQ" };
                await userManager.CreateAsync(user, "AdminPassword1");

                await userManager.AddToRoleAsync(user, "Admin");
            }
        }
    }
}
