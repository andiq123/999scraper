using API.Hubs;
using API.Services;
using Core.DTOs;
using Infrastructure.Data;
using Infrastructure.IdentityEntities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace API.Controllers
{
    public class AccountController : BaseApiController
    {
        private readonly SignInManager<AppUser> _singInManager;
        private readonly UserManager<AppUser> _userManager;
        private readonly DataContext _context;
        private readonly TokenService _tokenService;
        private readonly IHubContext<UserAccountHub> _hubContext;

        public AccountController(SignInManager<AppUser> singInManager,
        UserManager<AppUser> userManager,
         DataContext context,
         TokenService tokenService,
         IHubContext<UserAccountHub> hubContext)
        {
            _tokenService = tokenService;
            _context = context;
            _userManager = userManager;
            _singInManager = singInManager;
            _hubContext = hubContext;
        }

        [Authorize]
        [HttpGet("current")]
        public async Task<ActionResult<UserDto>> GetCurrentUser()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = await _context.Users.FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null) return NotFound(new { error = "User not found" });

            user.LastActive = DateTime.Now.ToUniversalTime();
            await _context.SaveChangesAsync();
            await InvokeLastUpdatedAsync(user.Id, user.LastActive);

            if (user.LockoutEnabled) return Unauthorized("Account banned");

            return await ReturnUserDtoFromUser(user);
        }


        [HttpPost("login")]
        public async Task<ActionResult<UserDto>> LoginAsync([FromBody] LoginDto loginDto)
        {
            var user = await _userManager.FindByNameAsync(loginDto.Username);
            if (user == null)
                user = await _userManager.FindByEmailAsync(loginDto.Username);
            if (user == null)
                return Unauthorized(new { error = "Username or Email or password incorrect" });

            var passwordCheck = await _singInManager.CheckPasswordSignInAsync(user, loginDto.Password, false);
            if (!passwordCheck.Succeeded)
                return Unauthorized(new { error = "Username or Email or password incorrect" });

            user.LastActive = DateTime.Now.ToUniversalTime();
            await _context.SaveChangesAsync();
            await InvokeLastUpdatedAsync(user.Id, user.LastActive);

            if (user.LockoutEnabled) return Unauthorized("Account banned");
            return await ReturnUserDtoFromUser(user);
        }

        [HttpPost("register")]
        public async Task<ActionResult<UserDto>> RegisterAsync([FromBody] RegisterDto registerDto)
        {
            var userToCreate = new AppUser()
            {
                Email = registerDto.Email,
                UserName = registerDto.Username,
            };

            var userCreated = await _userManager.CreateAsync(userToCreate, registerDto.Password);
            if (!userCreated.Succeeded) return Unauthorized(userCreated.Errors);

            var user = await _userManager.FindByEmailAsync(userToCreate.Email);
            if (user == null) return NotFound(new { error = "User created but not found in database..." });
            user.LockoutEnabled = false;

            user.LastActive = DateTime.Now.ToUniversalTime();
            await _context.SaveChangesAsync();

            await _hubContext.Clients.All.SendAsync("UserRegistered", new UserDto()
            {
                Id = user.Id,
                Email = user.Email,
                Username = user.UserName,
                LastActive = user.LastActive,
            });

            return await ReturnUserDtoFromUser(user);
        }

        protected async Task<UserDto> ReturnUserDtoFromUser(AppUser user)
        {
            return new UserDto()
            {
                Email = user.Email,
                Username = user.UserName,
                Token = await _tokenService.CreateToken(user),
                LastActive = user.LastActive,
            };
        }

        private async Task InvokeLastUpdatedAsync(string userId, DateTime time)
        {
            await _hubContext.Clients.All.SendAsync("LastActiveUpdated", new { userId = userId, lastActive = time });
        }
    }
}