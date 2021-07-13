using System.Collections.Generic;
using System.Threading.Tasks;
using Core;
using Core.Entities;

namespace Infrastructure.Data
{
    public class GenericRepository<T> : IGenericRepository<T> where T : BaseEntity
    {
        public Task<IReadOnlyList<T>> GetListAsync(T name)
        {
            throw new System.NotImplementedException();
        }
    }
}