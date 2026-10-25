using System.Security.Cryptography;
using System.Text;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public sealed class AuthorityPathHashTests
{
    [Fact]
    public void Compute_MatchesKnownSha256()
    {
        var expected = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes("abc|12,15,18"))).ToLowerInvariant();
        Assert.Equal(expected, AuthorityPathHash.Compute("abc", [12, 15, 18]));
    }

    [Fact]
    public void Compute_IsStableAndCaseSensitiveOnGraphHash()
    {
        var a = AuthorityPathHash.Compute("Graph", [1, 2]);
        var b = AuthorityPathHash.Compute("graph", [1, 2]);
        Assert.NotEqual(a, b);
        Assert.Equal(AuthorityPathHash.Compute("Graph", [1, 2]), a);
    }
}
