using System;
using System.Collections.Generic;
using Core.Entities;
using Microsoft.AspNetCore.Identity;

namespace Infrastructure.IdentityEntities
{
    public class AppUser : IdentityUser
    {
        public ICollection<FavProduct> Products { get; set; } = new List<FavProduct>();
    }
}