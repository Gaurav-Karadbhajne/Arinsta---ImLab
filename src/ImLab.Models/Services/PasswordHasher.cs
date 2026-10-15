using System.Security.Cryptography;

namespace ImLab.Models.Services;

/// <summary>PBKDF2-SHA256 hashes in the form v1.{iterations}.{saltBase64}.{hashBase64}.</summary>
public static class PasswordHasher
{
    private const int Iterations = 100_000;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var h = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"v1.{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(h)}";
    }

    public static bool Verify(string password, string stored)
    {
        var p = stored.Split('.');
        if (p.Length != 4 || p[0] != "v1" || !int.TryParse(p[1], out var it)) return false;
        var salt = Convert.FromBase64String(p[2]); var expected = Convert.FromBase64String(p[3]);
        var h = Rfc2898DeriveBytes.Pbkdf2(password, salt, it, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(h, expected);
    }
}
