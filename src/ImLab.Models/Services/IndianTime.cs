namespace ImLab.Models.Services;

/// <summary>The lab runs on Indian Standard Time (UTC+05:30) wherever the server is hosted.</summary>
public static class IndianTime
{
    public static readonly TimeZoneInfo Zone = Resolve();

    /// <summary>Database DATETIME values read back as Unspecified; every stored timestamp is UTC.</summary>
    public static DateTime FromUtc(DateTime value) => TimeZoneInfo.ConvertTimeFromUtc(AsUtc(value), Zone);

    /// <summary>An IST wall-clock instant converted to the UTC form stored in the database.</summary>
    public static DateTime ToUtc(DateTime local) =>
        TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), Zone);

    public static DateTime AsUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    /// <summary>The current date in India - the day the lab calls "today".</summary>
    public static DateOnly Today => DateOnly.FromDateTime(FromUtc(DateTime.UtcNow));

    private static TimeZoneInfo Resolve()
    {
        foreach (var id in new[] { "Asia/Kolkata", "India Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("IST", TimeSpan.FromMinutes(330), "India Standard Time", "IST");
    }
}
