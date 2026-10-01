using WaroTrans.IntegrationTests.Infrastructure;

namespace WaroTrans.IntegrationTests.Fleet.DispatchRobot;

[Collection(IntegrationCollection.Name)]
public sealed class DispatchRobotIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact(Skip = "DispatchRobot API not implemented yet")]
    public Task Dispatch_assigns_available_robot_in_database()
    {
        return Task.CompletedTask;
    }
}
