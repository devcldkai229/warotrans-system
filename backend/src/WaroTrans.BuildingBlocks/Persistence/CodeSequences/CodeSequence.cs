namespace WaroTrans.BuildingBlocks.Persistence.CodeSequences;

public sealed class CodeSequence
{
    public string Key { get; set; } = string.Empty;
    public long NextValue { get; set; } = 1;
    public DateTimeOffset? DayBucket { get; set; }
}
