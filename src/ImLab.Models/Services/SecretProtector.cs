using System.Security.Cryptography;

namespace ImLab.Models.Services;

/// <summary>AES-GCM protection for database passwords stored in the master database.
/// Values starting with "plain:" are accepted only when allowPlain is true (local development).</summary>
public sealed class SecretProtector(byte[] key, bool allowPlain)
{
    public string Protect(string plain)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var data = System.Text.Encoding.UTF8.GetBytes(plain);
        var cipher = new byte[data.Length]; var tag = new byte[16];
        using var gcm = new AesGcm(key, 16);
        gcm.Encrypt(nonce, data, cipher, tag);
        return Convert.ToBase64String(nonce.Concat(tag).Concat(cipher).ToArray());
    }

    public string Unprotect(string value)
    {
        if (value.StartsWith("plain:")) return allowPlain ? value[6..] : throw new InvalidOperationException("Plain secrets are not allowed here.");
        var all = Convert.FromBase64String(value);
        var nonce = all[..12]; var tag = all[12..28]; var cipher = all[28..];
        var data = new byte[cipher.Length];
        using var gcm = new AesGcm(key, 16);
        gcm.Decrypt(nonce, cipher, tag, data);
        return System.Text.Encoding.UTF8.GetString(data);
    }
}
