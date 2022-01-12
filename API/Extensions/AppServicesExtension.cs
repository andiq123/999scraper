using System;
using Core.Interfaces;
using Infrastructure.AutoMapper;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
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
            services.AddAutoMapper(typeof(Mapper));
            services.AddScoped<ActivityRepository>();

            services.AddCors(policy => policy.AddDefaultPolicy(x =>
             x.AllowAnyHeader()
             .AllowAnyMethod()
             .AllowAnyOrigin()
             .AllowCredentials()
             .WithOrigins("https://localhost:4200")));
            services.AddSignalR();

            services.AddDbContext<DataContext>(options =>
          {
              var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");

              string connStr;

              // Depending on if in development or production, use either Heroku-provided
              // connection string, or development connection string from env var.
              if (env == "Development")
              {
                  // Use connection string from file.
                  connStr = config.GetConnectionString("DefaultConnection");
              }
              else
              {
                  // Use connection string provided at runtime by Heroku.
                  var connUrl = Environment.GetEnvironmentVariable("DATABASE_URL");

                  // Parse connection URL to connection string for Npgsql
                  connUrl = connUrl.Replace("postgres://", string.Empty);
                  var pgUserPass = connUrl.Split("@")[0];
                  var pgHostPortDb = connUrl.Split("@")[1];
                  var pgHostPort = pgHostPortDb.Split("/")[0];
                  var pgDb = pgHostPortDb.Split("/")[1];
                  var pgUser = pgUserPass.Split(":")[0];
                  var pgPass = pgUserPass.Split(":")[1];
                  var pgHost = pgHostPort.Split(":")[0];
                  var pgPort = pgHostPort.Split(":")[1];

                  connStr = $"Server={pgHost};Port={pgPort};User Id={pgUser};Password={pgPass};Database={pgDb}; SSL Mode=Require; Trust Server Certificate=true";
              }

              // Whether the connection string came from the local development configuration file
              // or from the environment variable from Heroku, use it to set up your DbContext.
              options.UseNpgsql(connStr);
          });
            services.AddSingleton<ConnectionMultiplexer>(c =>
            {
                var configuration = ConfigurationOptions.Parse(config.GetConnectionString("Redis"), true);
                return ConnectionMultiplexer.Connect(configuration);
            });
            return services;
        }
    }
}