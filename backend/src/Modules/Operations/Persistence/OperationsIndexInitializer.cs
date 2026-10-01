namespace WaroTrans.Operations.Persistence;

public sealed class OperationsIndexInitializer(OperationsMongoContext context)
{
    public Task EnsureIndexesAsync(CancellationToken cancellationToken = default)
        => context.EnsureIndexesAsync(cancellationToken);
}
