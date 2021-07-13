namespace Core.Entities
{
    public class FiltersForUrl
    {
        public string ProductName { get; set; }
        public bool ByRelevance { get; set; }
        public bool ByDate { get; set; }
        public bool ExludeDublicate { get; set; } = true;
    }
}