using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Core.Entities;

namespace Core.Interfaces
{
    public interface IProductRepository
    {
        Task<IReadOnlyList<Product>> GetProductsAsync(string productName, FiltersForUrl filters, CancellationToken token);
        event EventHandler<ProgressReport> ProgressChanged;
    }
}