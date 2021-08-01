using System.Text;
using API.Services;
using Infrastructure.Data;
using Infrastructure.IdentityEntities;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace API.Extensions
{
    public static class AppIndetityServicesExtension
    {
        public static IServiceCollection AddIdentity(this IServiceCollection services, IConfiguration config)
        {
            services.AddScoped<TokenService>();

            services.AddIdentityCore<AppUser>(opt =>
             {
                 opt.Password.RequiredUniqueChars = 0;
                 opt.Password.RequireNonAlphanumeric = false;
                 opt.Password.RequireUppercase = false;
                 opt.User.RequireUniqueEmail = true;
             })
            .AddRoles<IdentityRole>()
            .AddRoleManager<RoleManager<IdentityRole>>()
            .AddRoleValidator<RoleValidator<IdentityRole>>()
            .AddSignInManager<SignInManager<AppUser>>()
            .AddEntityFrameworkStores<DataContext>();


            services.AddAuthentication(auth =>
            {
                auth.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                auth.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            }).AddJwtBearer(opt =>
            {
                opt.TokenValidationParameters = new TokenValidationParameters()
                {
                    ValidateIssuer = true,
                    ValidIssuer = config["Token:Issuer"],
                    ValidateAudience = false,
                    ValidAudience = config["Token:Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Token:Key"])),
                    ValidateIssuerSigningKey = true,
                    RequireExpirationTime = true
                };
            });

            return services;
        }
    }
}