using System;
using System.Text.Json;
using System.Threading.Tasks;
using Core.Entities;
using Core.Interfaces;
using StackExchange.Redis;

namespace Infrastructure.Data
{
    public class RedisRepository : IRedisRepository
    {
        private readonly IDatabase _database;
        public RedisRepository(ConnectionMultiplexer store)
        {
            _database = store.GetDatabase();
        }

        public async Task<ProductsContainer> GetContainerAsync(string id)
        {
            var data = await _database.StringGetAsync(id);
            return data.IsNullOrEmpty ? null : JsonSerializer.Deserialize<ProductsContainer>(data);
        }

        public async Task<ProductsContainer> UpdateContainerAsync(ProductsContainer container)
        {
            var created = await _database.StringSetAsync(container.Id, JsonSerializer.Serialize(container), TimeSpan.FromMinutes(5));
            if (!created) return null;
            return await GetContainerAsync(container.Id);
        }

        public async Task<bool> DeleteContainerAsync(string id)
        {
            return await _database.KeyDeleteAsync(id);
        }
    }
}