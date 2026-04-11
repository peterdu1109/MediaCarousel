using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace JellyfinCarouselPlugin;

/// <summary>
/// Filtre de démarrage qui ajoute le middleware d'injection en tête du pipeline ASP.NET Core
/// </summary>
public class CarouselStartupFilter : IStartupFilter
{
    /// <inheritdoc />
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<CarouselInjectMiddleware>();
            next(app);
        };
    }
}
