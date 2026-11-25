namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// Fault Injection Lab: sends one inject/clear message to a robot's <c>lab</c> topic. The robot obeys it only when its
/// own configuration allows lab faults (LAB_ENABLED on the test robot), and every fault ends by itself (TTL).
/// </summary>
public interface IMqttLabPublisher
{
    Task PublishLabAsync(string robotCode, object body, CancellationToken cancellationToken = default);
}
