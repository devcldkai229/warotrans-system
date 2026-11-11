namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>WFX-04. Section "Recovery".</summary>
public sealed class RecoveryOptions
{
    public const string SectionName = "Recovery";

    /// <summary>How long a robot may be silent before its Job leaves RUNNING. Short drops of the network stay below this.</summary>
    public int OfflineGraceSeconds { get; set; } = 120;
}
