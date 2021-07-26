using System;
using System.Security.Claims;
using System.Threading.Tasks;
using API.DTOs;
using API.Services;
using Infrastructure.Data;
using Infrastructure.IdentityEntities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers
{
    public class AccountController : BaseApiController
    {
        private readonly SignInManager<AppUser> _singInManager;
        private readonly UserManager<AppUser> _userManager;
        private readonly TokenService _tokenService;
        private readonly DataContext _context;

        public AccountController(SignInManager<AppUser> singInManager, UserManager<AppUser> userManager, TokenService tokenService, DataContext context)
        {
            _context = context;
            _tokenService = tokenService;
            _userManager = userManager;
            _singInManager = singInManager;
        }

        private UserDto ReturnUserFromObject(AppUser user)
        {
            return new UserDto()
            {
                Email = user.Email,
                Username = user.UserName,
                Token = _tokenService.CreateToken(user)
            };
        }

        [Authorize]
        [HttpGet("current")]
        public async Task<ActionResult<UserDto>> GetCurrentUser()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            Console.WriteLine(userId);
            var user = await _context.Users.FirstOrDefaultAsync(x => x.Id == userId);
            if (user == null) return NotFound(new { error = "User not found" });
            return ReturnUserFromObject(user);
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
            return ReturnUserFromObject(user);
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

            return ReturnUserFromObject(user);
        }
    }
}