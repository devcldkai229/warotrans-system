namespace WaroTrans.BuildingBlocks.Options;

public sealed class JwtOptions
{
    public const string SectionName = "Authentication:Jwt";

    // HMAC-SHA256 needs a key of at least 256 bits.
    public const int MinimumKeyBytes = 32;

    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = "warotrans";
    public string Audience { get; set; } = "warotrans-clients";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 7;
}
