namespace WaroTrans.BuildingBlocks.Abstractions;

/// <summary>Where a container problem can be seen.</summary>
public enum ContainerProblemScope
{
    /// <summary>At a pickup or drop-off (shelf, gate): the person scans and looks at the outside of the container.</summary>
    HANDOVER,

    /// <summary>At the quality inspection point, where the container is opened: also what is inside.</summary>
    INSPECTION
}

/// <param name="BlocksHandover">An open issue with this code refuses the confirmation of that container's handover.</param>
/// <param name="HoldsWhenReported">Reported without taking the container off the Job: it is held once delivered.</param>
/// <param name="High">The issue opens at HIGH severity (MEDIUM otherwise).</param>
/// <param name="Outcomes">What resolving an issue that holds the container may do with it (<see cref="ContainerHoldOutcomes"/>).</param>
public sealed record ContainerProblemRule(
    string Code,
    ContainerProblemScope Scope,
    bool BlocksHandover,
    bool HoldsWhenReported,
    bool High,
    IReadOnlyList<string> Outcomes);

/// <summary>
/// The one list of container problem codes, shared by Report issue, "Container failed" and quality inspection. A
/// container taken off its Job ("Container failed", a failed inspection) is always held where it is, whatever the code.
/// </summary>
public static class ContainerProblemCodes
{
    public const string WrongContainer = "WRONG_CONTAINER";
    public const string MissingContainer = "MISSING_CONTAINER";
    public const string ContainerDamaged = "CONTAINER_DAMAGED";
    public const string BarcodeUnreadable = "BARCODE_UNREADABLE";
    public const string UnsafeLoad = "UNSAFE_LOAD";
    public const string Other = "OTHER";
    public const string ProductMismatch = "PRODUCT_MISMATCH";
    public const string QuantityMismatch = "QUANTITY_MISMATCH";
    public const string ContentsDamaged = "CONTENTS_DAMAGED";
    public const string PackagingDefect = "PACKAGING_DEFECT";

    // A container is a packed box of goods, not a reusable tote: every outcome speaks of the goods and the package.
    public static readonly IReadOnlyList<ContainerProblemRule> Rules =
    [
        new(WrongContainer, ContainerProblemScope.HANDOVER, BlocksHandover: true, HoldsWhenReported: false, High: true,
            [ContainerHoldOutcomes.Found, ContainerHoldOutcomes.Lost]),
        new(MissingContainer, ContainerProblemScope.HANDOVER, BlocksHandover: true, HoldsWhenReported: false, High: true,
            [ContainerHoldOutcomes.Found, ContainerHoldOutcomes.Lost]),
        new(ContainerDamaged, ContainerProblemScope.HANDOVER, BlocksHandover: false, HoldsWhenReported: true, High: true,
            [ContainerHoldOutcomes.Repack, ContainerHoldOutcomes.Scrap]),
        new(BarcodeUnreadable, ContainerProblemScope.HANDOVER, BlocksHandover: false, HoldsWhenReported: false, High: false,
            [ContainerHoldOutcomes.Relabel]),
        new(UnsafeLoad, ContainerProblemScope.HANDOVER, BlocksHandover: false, HoldsWhenReported: true, High: true,
            [ContainerHoldOutcomes.Restack, ContainerHoldOutcomes.Scrap]),
        new(Other, ContainerProblemScope.HANDOVER, BlocksHandover: false, HoldsWhenReported: false, High: false,
            [ContainerHoldOutcomes.Release, ContainerHoldOutcomes.AdjustQuantity, ContainerHoldOutcomes.Scrap]),
        new(ProductMismatch, ContainerProblemScope.INSPECTION, BlocksHandover: false, HoldsWhenReported: true, High: true,
            [ContainerHoldOutcomes.Scrap]),
        new(QuantityMismatch, ContainerProblemScope.INSPECTION, BlocksHandover: false, HoldsWhenReported: true, High: false,
            [ContainerHoldOutcomes.AdjustQuantity, ContainerHoldOutcomes.Scrap]),
        new(ContentsDamaged, ContainerProblemScope.INSPECTION, BlocksHandover: false, HoldsWhenReported: true, High: true,
            [ContainerHoldOutcomes.AdjustQuantity, ContainerHoldOutcomes.Scrap, ContainerHoldOutcomes.Release]),
        new(PackagingDefect, ContainerProblemScope.INSPECTION, BlocksHandover: false, HoldsWhenReported: true, High: false,
            [ContainerHoldOutcomes.Repack, ContainerHoldOutcomes.Scrap]),
    ];

    public static IReadOnlyList<string> All { get; } = Rules.Select(r => r.Code).ToList();

    public static IReadOnlyList<string> Blocking { get; } = Rules.Where(r => r.BlocksHandover).Select(r => r.Code).ToList();

    public static ContainerProblemRule? Find(string? code) => Rules.FirstOrDefault(r => r.Code == code);

    /// <summary>Whether <paramref name="code"/> can be reported where the container is not opened.</summary>
    public static bool SeenAtHandover(string code) => Find(code)?.Scope == ContainerProblemScope.HANDOVER;

    /// <summary>The outcomes an issue with that code may choose; an unknown or missing code: those of OTHER.</summary>
    public static IReadOnlyList<string> OutcomesFor(string? code) => (Find(code) ?? Find(Other)!).Outcomes;
}

/// <summary>
/// What happens to a held container (a packed box of goods) when its issue is resolved. Every outcome but SCRAP and LOST
/// puts the box back in use where it is; the outcome itself is the record of what people did.
/// </summary>
public static class ContainerHoldOutcomes
{
    /// <summary>Checked again: nothing wrong, back in use as it is.</summary>
    public const string Release = "RELEASE";

    /// <summary>The goods were counted (or the damaged part taken out): the quantity left is recorded, then back in use.</summary>
    public const string AdjustQuantity = "ADJUST_QUANTITY";

    /// <summary>The goods were packed into a new box and labelled again; the package keeps its code.</summary>
    public const string Repack = "REPACK";

    /// <summary>A new label was printed and stuck on.</summary>
    public const string Relabel = "RELABEL";

    /// <summary>The goods were stacked again so the robot can carry it safely.</summary>
    public const string Restack = "RESTACK";

    /// <summary>The missing (or right) package was found where it is.</summary>
    public const string Found = "FOUND";

    /// <summary>The whole package is destroyed: off the stock it was counted on.</summary>
    public const string Scrap = "SCRAP";

    /// <summary>The package is lost: off the stock it was counted on.</summary>
    public const string Lost = "LOST";

    public static readonly IReadOnlyList<string> All = [Release, AdjustQuantity, Repack, Relabel, Restack, Found, Scrap, Lost];

    /// <summary>The package leaves the stock (SCRAP, LOST); every other outcome puts it back in use.</summary>
    public static bool RemovesFromStock(string outcome) => outcome is Scrap or Lost;
}
