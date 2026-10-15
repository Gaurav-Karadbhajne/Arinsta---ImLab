using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace ImLab.Models.Services;

public sealed record JwtOptions(string Key, string Issuer, string Audience, int Minutes);

public sealed class JwtTokenService(JwtOptions o)
{
    public (string Token, DateTime Expires) Create(long userId, string name, string role, long centerId, long tenantId, string companyId, IEnumerable<string> permissions, decimal? maxDiscount)
    {
        var expires = DateTime.UtcNow.AddMinutes(o.Minutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()), new("name", name), new("role", role),
            new("center", centerId.ToString()), new("tid", tenantId.ToString()), new("cid", companyId),
            new("maxdisc", (maxDiscount ?? 100m).ToString(System.Globalization.CultureInfo.InvariantCulture))
        };
        claims.AddRange(permissions.Select(p => new Claim("perm", p)));
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(o.Key)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(o.Issuer, o.Audience, claims, expires: expires, signingCredentials: creds);
        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }
}
