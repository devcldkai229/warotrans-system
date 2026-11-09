using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.UnitTests.BuildingBlocks.Authorization;

public class AuditRedactionTests
{
    [Theory]
    [InlineData("password")]
    [InlineData("temporaryPassword")]
    [InlineData("PasswordHash")]
    [InlineData("refreshToken")]
    [InlineData("apiSecret")]
    public void Secrets_never_reach_the_audit_log(string key)
    {
        var redacted = AuditRedaction.Redact(new Dictionary<string, object?> { [key] = "x", ["role"] = "ADMIN" })!;

        Assert.False(redacted.ContainsKey(key));
        Assert.Equal("ADMIN", redacted["role"]);
    }

    [Fact]
    public void Nothing_in_nothing_out() => Assert.Null(AuditRedaction.Redact(null));
}
