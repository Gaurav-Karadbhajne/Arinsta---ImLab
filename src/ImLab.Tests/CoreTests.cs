using ImLab.Models.Services;
using Xunit;

namespace ImLab.Tests;

public class CoreTests
{
    [Fact]
    public void Totals_apply_percent_discount()
    {
        var (total, discount, net) = BookingTotals.Calc(new[] { 300m, 500m }, 10m);
        Assert.Equal(800m, total); Assert.Equal(80m, discount); Assert.Equal(720m, net);
    }

    [Fact]
    public void Password_round_trip_and_seed_hash()
    {
        var h = PasswordHasher.Hash("Secret#1");
        Assert.True(PasswordHasher.Verify("Secret#1", h));
        Assert.False(PasswordHasher.Verify("wrong", h));
        Assert.True(PasswordHasher.Verify("Imlab@123", "v1.100000.V54+KeguXy6BgU7Nm8k3jw==.cdyyY4C/cEfLeHbVK68DE1wl13LKurikRZvi3XWQ3tQ="));
    }

    [Fact]
    public void Secret_protector_round_trip()
    {
        var p = new SecretProtector(new byte[32], allowPlain: false);
        Assert.Equal("db-pass", p.Unprotect(p.Protect("db-pass")));
        Assert.Throws<InvalidOperationException>(() => p.Unprotect("plain:x"));
    }
}
