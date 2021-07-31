using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using AutoMapper;
using AutoMapper.QueryableExtensions;
using Core.DTOs;
using Core.Entities;
using Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers
{
    [Authorize(Roles = "Admin")]
    public class AdminController : BaseApiController
    {
        private readonly DataContext _context;
        private readonly IMapper _mapper;
        public AdminController(DataContext context, IMapper mapper)
        {
            _mapper = mapper;
            _context = context;
        }

        [HttpGet("users")]
        public async Task<ActionResult<IReadOnlyList<UserDto>>> GetAllUsersAsync()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var users = await _context.Users.ProjectTo<UserDto>(_mapper.ConfigurationProvider).Where(x => x.Id != userId).ToListAsync();
            if (users.Count == 0) return NotFound(new { error = "No users found" });
            return Ok(users);
        }

        [HttpGet("{userId}/activity")]
        public async Task<ActionResult<IReadOnlyList<Activity>>> GetAllUsersAsync(string userId)
        {
            var user = await _context.Users.Include(x => x.Activities).FirstOrDefaultAsync(x => x.Id == userId);
            if (user.Activities.Count == 0) return NotFound(new { error = "No activities for this user" });
            return Ok(user.Activities.ToList());
        }

        [HttpPost("{userId}/blockUnBlock")]
        public async Task<IActionResult> BlockUserAsync(string userId)
        {
            var user = await _context.Users.FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null) return NotFound("No user found");
            user.LockoutEnabled = !user.LockoutEnabled;
            await _context.SaveChangesAsync();
            return Ok(new { status = user.LockoutEnabled });
        }

    }
}