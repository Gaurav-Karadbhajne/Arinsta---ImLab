// Simple math captcha so we don't depend on any external service (works offline, fine for a lab product).
// Flow: client GETs /auth/captcha -> we generate two numbers, cache the ANSWER under a random id, return id + question.
//       client posts the id + answer with login -> Verify removes the entry (one try per code) and compares.
using Microsoft.Extensions.Caching.Memory;
using ImLab.Models.ViewModels; 
namespace ImLab.Models.Services;

public sealed class CaptchaService(IMemoryCache cache)
{
    private static readonly Random Rnd = new();   // captcha randomness doesn't need cryptographic strength

    // Creates a new challenge. The answer is cached for 5 minutes under a fresh GUID.
    public CaptchaVm Create()
    {
        var a = Rnd.Next(1, 10); var b = Rnd.Next(1, 10);
        var id = Guid.NewGuid().ToString("N");
        cache.Set($"captcha:{id}", (a + b).ToString(), TimeSpan.FromMinutes(5));
        return new CaptchaVm(id, $"{a} + {b} = ?");
    }

    // One-shot check: the entry is DELETED on first verify so the same captcha can't be replayed or brute-forced.
    public bool Verify(string id, string? answer) =>
        !string.IsNullOrWhiteSpace(answer) && cache.TryGetValue($"captcha:{id}", out var expected) && expected as string == answer.Trim();
}