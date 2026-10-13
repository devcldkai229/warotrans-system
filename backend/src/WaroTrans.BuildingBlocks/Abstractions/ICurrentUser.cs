namespace WaroTrans.BuildingBlocks.Abstractions;

public interface ICurrentUser
{
    Guid? AccountId { get; }
    string? Username { get; }
    string? Role { get; }
    bool IsAuthenticated { get; }
}
