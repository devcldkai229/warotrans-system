namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>WH-03. Section "HumanTasks".</summary>
public sealed class HumanTaskOptions
{
    public const string SectionName = "HumanTasks";

    /// <summary>How long a claim lasts. When it runs out the step is offered to everyone again.</summary>
    public int ClaimLeaseSeconds { get; set; } = 300;

    public int StopOfferDelaySeconds { get; set; } = 10;
    public int StopBeginWindowSeconds { get; set; } = 120;
}
