using System;

namespace Core.Entities
{
    public class ProgressReport : EventArgs
    {
        public ProgressReport() { }
        public ProgressReport(int currentPage, int totalPages, int progressPercentage)
        {
            CurrentPage = currentPage;
            TotalPages = totalPages;
            ProgressPercentage = progressPercentage;
        }

        public int CurrentPage { get; set; }
        public int TotalPages { get; set; }
        public int ProgressPercentage { get; set; }

        public override string ToString()
        {
            return $"CurrentPage: {CurrentPage}, TotalPages: {TotalPages}, ProgressPercentage: {ProgressPercentage}";
        }
    }
}