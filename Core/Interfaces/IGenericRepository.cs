using System.Collections.Generic;
using System.Threading.Tasks;
using Core.Entities;

namespace Core
{
    public interface IGenericRepository<T> where T : BaseEntity
    {
        Task<IReadOnlyList<T>> GetListAsync(T name);
    }
}