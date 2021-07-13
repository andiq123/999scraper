using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using AngleSharp.Html.Dom;
using AngleSharp.Html.Parser;

namespace Infrastructure.Helpers
{
    public class GetDocument
    {
        public static async Task<IHtmlDocument> GetDocumentAsync(HttpClient client, string url)
        {
            var debug = 1;
            if (debug == 0)
            {
                using (HttpResponseMessage request = await client.GetAsync(new Uri(url), HttpCompletionOption.ResponseHeadersRead))
                {
                    var respone = await request.Content.ReadAsStringAsync();
                    await File.WriteAllTextAsync("html.html", respone);
                    return new HtmlParser().ParseDocument(respone);
                }
            }
            else
            {
                try
                {
                    var htmlFile = await File.ReadAllTextAsync("html.html");
                    return new HtmlParser().ParseDocument(htmlFile);
                }
                catch (Exception)
                {
                    using (HttpResponseMessage request = await client.GetAsync(new Uri(url), HttpCompletionOption.ResponseHeadersRead))
                    {
                        var respone = await request.Content.ReadAsStringAsync();
                        await File.WriteAllTextAsync("html.html", respone);
                        return new HtmlParser().ParseDocument(respone);
                    }
                }
            }
        }
    }
}