using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.Transportation.Features.Cancellation;

namespace WaroTrans.Transportation.Services;

/// <summary>
/// TRN-03: a robot reports its motion hold in telemetry and an unconfirmed stop times out without any event, so the
/// cancellations in progress are looked at again every few seconds. Nothing runs when none is in progress.
/// </summary>
public sealed class TransportCancellationHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<TransportCancellationHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<TransportCancellationService>().RefreshActiveAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Cancellation refresh tick failed");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
