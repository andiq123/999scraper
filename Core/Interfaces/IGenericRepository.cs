using Core.Entities;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Core
{
    public interface IGenericRepository<T> where T : BaseEntity
    {
        Task<IReadOnlyList<T>> GetListAsync(T name);
    }
}