using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace WaroTrans.BuildingBlocks.Abstractions;

public sealed class InProcessIntegrationEventPublisher(
    IServiceScopeFactory scopeFactory,
    ILogger<InProcessIntegrationEventPublisher> logger) : IIntegrationEventPublisher
{
    public async Task PublishAsync<TEvent>(TEvent integrationEvent, CancellationToken cancellationToken = default)
        where TEvent : IIntegrationEvent
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var handlers = scope.ServiceProvider.GetServices<IIntegrationEventHandler<TEvent>>();

        foreach (var handler in handlers)
        {
            try
            {
                await handler.HandleAsync(integrationEvent, cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "Failed handling integration event {EventType} ({EventId})",
                    typeof(TEvent).Name,
                    integrationEvent.EventId);
                throw;
            }
        }
    }
}
