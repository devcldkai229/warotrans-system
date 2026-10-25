using System.Security.Cryptography;
using System.Text;

namespace WaroTrans.Fleet.Traffic;

/// <summary>SHA-256 of <c>graphHash|id,id,...</c> — must match robot <c>compute_path_hash</c>.</summary>
public static class AuthorityPathHash
{
    public static string Compute(string graphHash, IReadOnlyList<int> edgeIds)
    {
        var ids = string.Join(",", edgeIds);
        var payload = $"{graphHash}|{ids}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
