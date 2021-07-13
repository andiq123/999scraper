namespace Core.Configs
{
    public class Configs
    {
        private static string _baseUrl = "https://999.md";
        private static string _searchQuery = _baseUrl + "/ru/search?query=";

        public static string GetBaseUrl()
        {
            return _baseUrl;
        }

        public static string GetSearchQuery()
        {
            return _searchQuery;
        }
    }
}