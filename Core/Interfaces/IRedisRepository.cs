using Core.Entities;
using System.Threading.Tasks;

namespace Core.Interfaces
{
    public interface IRedisRepository
    {
        Task<ProductsContainer> GetContainerAsync(string id);
        Task<ProductsContainer> UpdateContainerAsync(ProductsContainer container);
        Task<bool> DeleteContainerAsync(string id);
    }
}