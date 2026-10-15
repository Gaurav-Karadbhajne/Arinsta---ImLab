using ImLab.Models.Data;
using ImLab.Models.Repositories;

namespace ImLab.Web.Middleware;

/// <summary>Resolves the lab from the company ID inside the signed login token. The browser cannot choose the tenant.</summary>
public sealed class TenantMiddleware(RequestDelegate next)
{
    public async Task Invoke(HttpContext ctx, ITenantStore store, ITenantContext tenant)
    {
        var cid = ctx.User.FindFirst("cid")?.Value;
        if (cid is null) { await next(ctx); return; }                // login and public files resolve the tenant themselves
        var info = await store.GetAsync(cid, ctx.RequestAborted);
        if (info is null) { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
        tenant.Set(info);
        await next(ctx);
    }
}
