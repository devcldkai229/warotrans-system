using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Entities;

public sealed class EndpointGroup
{
    public Guid Id { get; set; }
    public Guid MapVersionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public EndpointSelectionPolicy SelectionPolicy { get; set; }
    public bool IsActive { get; set; }
}
