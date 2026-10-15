namespace ImLab.Models.Services;

/// <summary>Pure billing arithmetic, kept free of I/O so it is easy to test.</summary>
public static class BookingTotals
{
    public static (decimal Total, decimal Discount, decimal Net) Calc(IEnumerable<decimal> prices, decimal discountPercent)
    {
        var total = prices.Sum();
        var discount = Math.Round(total * discountPercent / 100m, 2, MidpointRounding.AwayFromZero);
        return (total, discount, total - discount);
    }
}
