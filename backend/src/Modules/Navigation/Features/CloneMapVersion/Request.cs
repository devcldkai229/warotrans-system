namespace WaroTrans.Navigation.Features.CloneMapVersion;

/// <param name="Name">Name of the new DRAFT. Empty = "Copy of {source name}".</param>
public sealed record CloneMapVersionRequest(string? Name);
