namespace WaroTrans.BuildingBlocks.Abstractions;

public interface ICurrentUser
{
    Guid? AccountId { get; }
    string? Username { get; }
    bool IsAuthenticated { get; }
}
