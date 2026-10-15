using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace ImLab.Models.Data;

internal static class SnakeCase
{
    public static string To(string s) => Regex.Replace(s, "([a-z0-9])([A-Z])", "$1_$2").ToLowerInvariant();

    /// <summary>Maps every DbSet property name to a snake_case table and every property to a snake_case column.</summary>
    public static void Apply(DbContext ctx, ModelBuilder b)
    {
        foreach (var p in ctx.GetType().GetProperties().Where(p => p.PropertyType.IsGenericType && p.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>)))
            b.Entity(p.PropertyType.GenericTypeArguments[0]).ToTable(To(p.Name));
        foreach (var e in b.Model.GetEntityTypes())
            foreach (var pr in e.GetProperties()) pr.SetColumnName(To(pr.Name));
    }
}
