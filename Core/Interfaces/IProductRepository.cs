using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Core.Entities;

namespace Core.Interfaces
{
    public interface IProductRepository
    {
        Task<IReadOnlyList<Product>> GetProductsAsync(string productName, FiltersForUrl filters);
        event EventHandler<ProgressReport> ProgressChanged;
    }
}