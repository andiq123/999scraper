using AngleSharp.Html.Dom;
using AngleSharp.Html.Parser;
using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace Infrastructure.Helpers
{
    public class GetDocument
    {
        public static async Task<IHtmlDocument> GetDocumentAsync(HttpClient client, string url, CancellationToken token)
        {
            var debug = 0;
            if (debug == 0)
            {
                using (HttpResponseMessage request = await client.GetAsync(new Uri(url), HttpCompletionOption.ResponseHeadersRead, token))
                {
                    var respone = await request.Content.ReadAsStringAsync();
                    return new HtmlParser().ParseDocument(respone);
                }
            }
            else
            {
                try
                {
                    var htmlFile = await File.ReadAllTextAsync("html.html", token);
                    return new HtmlParser().ParseDocument(htmlFile);
                }
                catch (Exception)
                {
                    using (HttpResponseMessage request = await client.GetAsync(new Uri(url), HttpCompletionOption.ResponseHeadersRead, token))
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