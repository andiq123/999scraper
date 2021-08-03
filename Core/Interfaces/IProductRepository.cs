using Core.Entities;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Core.Interfaces
{
    public interface IProductRepository
    {
        Task<IReadOnlyList<Product>> GetProductsAsync(string productName, FiltersForUrl filters, CancellationToken token);
        event EventHandler<ProgressReport> ProgressChanged;
    }
}