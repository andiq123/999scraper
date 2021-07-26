

using Core.Interfaces;
using Infrastructure.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

namespace API.Extensions
{
    public static class AppServicesExtension
    {
        public static IServiceCollection AddServices(this IServiceCollection services, IConfiguration config)
        {
            services.AddScoped<IProductRepository, ProductRepository>();
            services.AddScoped<IRedisRepository, RedisRepository>();

            services.AddCors(policy => policy.AddDefaultPolicy(x =>
             x.AllowAnyHeader()
             .AllowAnyMethod()
             .AllowAnyOrigin()
             .AllowCredentials()
             .WithOrigins("https://localhost:4200")));
            services.AddSignalR();


            services.AddSingleton<ConnectionMultiplexer>(c =>
            {
                var configuration = ConfigurationOptions.Parse(config.GetConnectionString("Redis"), true);
                return ConnectionMultiplexer.Connect(configuration);
            });
            return services;
        }
    }
}