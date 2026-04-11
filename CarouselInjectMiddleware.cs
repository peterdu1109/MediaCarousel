using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Middleware qui injecte le script carousel dans les réponses index.html sans modifier le fichier sur disque
/// </summary>
public class CarouselInjectMiddleware(RequestDelegate next)
{
    private const string InjectionTag = "<script src=\"/plugins/JellyfinCarouselPlugin/Web/carousel-layout.js\"></script>";

    /// <inheritdoc />
    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        if (!IsIndexPath(path))
        {
            await next(context);
            return;
        }

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        await next(context);

        buffer.Position = 0;

        if (context.Response.StatusCode == 200)
        {
            var body = await new StreamReader(buffer, Encoding.UTF8).ReadToEndAsync();

            if (body.Contains("</head>") && !body.Contains(InjectionTag))
            {
                body = body.Replace("</head>", $"    {InjectionTag}\n</head>");
                var bytes = Encoding.UTF8.GetBytes(body);
                context.Response.ContentLength = bytes.Length;
                context.Response.Body = originalBody;
                await originalBody.WriteAsync(bytes, context.RequestAborted);
                return;
            }
        }

        buffer.Position = 0;
        context.Response.Body = originalBody;
        await buffer.CopyToAsync(originalBody, context.RequestAborted);
    }

    private static bool IsIndexPath(string path) =>
        path.Equals("/web/index.html", System.StringComparison.OrdinalIgnoreCase)
        || path.Equals("/web/", System.StringComparison.OrdinalIgnoreCase)
        || path.Equals("/web", System.StringComparison.OrdinalIgnoreCase);
}
