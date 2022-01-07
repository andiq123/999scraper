using Core.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    public class ActivityRepository
    {
        private readonly DataContext _context;
        public ActivityRepository(DataContext context)
        {
            _context = context;
        }

        public async Task<Activity> AddActivityForUser(string userId, string searchCriteria)
        {
            var user = await _context.Users.Include(x => x.Activities).FirstOrDefaultAsync(x => x.Id == userId);
            var activity = new Activity() { DateTime = DateTime.Now.ToUniversalTime().ToUniversalTime(), Description = searchCriteria };
            user.Activities.Add(activity);
            user.LastActive = DateTime.Now.ToUniversalTime().ToUniversalTime();
            await _context.SaveChangesAsync();
            return activity;
        }
    }
}