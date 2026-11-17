using WaroTrans.BuildingBlocks.Exceptions;

namespace WaroTrans.BuildingBlocks.Reporting;

public static class ReportLimits
{
    /// <summary>Rows one detail file may hold. A longer export is refused instead of cut short without a word.</summary>
    public const int MaxRows = 100_000;

    public static ConflictException TooLarge(string dataset) => new(
        $"The {dataset} export has more than {MaxRows:N0} rows for this period. Choose a shorter period.",
        "report_too_large");
}
