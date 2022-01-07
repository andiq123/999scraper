
using Core.Entities;
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;

namespace Infrastructure.IdentityEntities
{
    public class AppUser : IdentityUser
    {
        public ICollection<FavProduct> Products { get; set; } = new List<FavProduct>();
        public ICollection<Activity> Activities { get; set; } = new List<Activity>();
        public DateTime LastActive { get; set; } = DateTime.Now.ToUniversalTime();
    }
}