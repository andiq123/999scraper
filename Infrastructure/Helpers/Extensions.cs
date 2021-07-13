using System;
using System.Collections.Generic;
using System.Linq;
using Core.Entities;

namespace Infrastructure.Helpers
{
    public static class Extensions
    {
        public static string ExcludeNumbersFromString(this string textContent)
        {
            try
            {
                string resultString = String.Join("", textContent.Where(x => char.IsLetter(x) || char.IsSymbol(x)).ToArray());
                return resultString;
            }
            catch (Exception)
            {
                return "";
            }
        }

        public static int? GetNumbersFromString(this string textContent)
        {
            try
            {
                string resultString = String.Join("", textContent.Where(char.IsDigit).ToArray());
                return int.Parse(resultString);
            }
            catch (Exception)
            {
                return 0;
            }
        }
        public static string AttribFiltersForUrl(this string url, FiltersForUrl filters)
        {
            if (filters.ByDate) url = url + "&search_by_relevance=no";
            if (filters.ByRelevance) url = url + "&search_by_relevance=yes";
            if (filters.ExludeDublicate) url = url + "&hide_duplicates=yes";
            url = url + "&view_type=detail";
            return url;
        }

    }
}
