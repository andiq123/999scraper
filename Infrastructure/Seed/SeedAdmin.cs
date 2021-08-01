using System;
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
                await roleManager.CreateAsync(new IdentityRole() { Id = Guid.NewGuid().ToString(), Name = "Admin" });

                var user = new AppUser { Id = Guid.NewGuid().ToString(), Email = "Andi@gmail.com", UserName = "AndiQ" };
                await userManager.CreateAsync(user, "AdminPassword1");

                var userFromDb = await userManager.FindByIdAsync(user.Id);
                userFromDb.LockoutEnabled = false;
                await userManager.UpdateAsync(userFromDb);

                await userManager.AddToRoleAsync(user, "Admin");
            }
        }
    }
}
