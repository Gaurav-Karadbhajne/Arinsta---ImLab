using System.Text.Json;
using System.Text.Json.Serialization;

namespace ImLab.Web.Serialization;

/// <summary>MySQL returns DATETIME with Kind=Unspecified, which JSON would emit without a zone.
/// Every stored timestamp is UTC, so emit it with the UTC marker; browsers then convert to IST.</summary>
public sealed class UtcDateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.GetDateTime();

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc));
}
