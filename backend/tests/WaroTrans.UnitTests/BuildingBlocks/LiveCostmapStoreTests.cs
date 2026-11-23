using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.UnitTests.Fleet.Traffic;

namespace WaroTrans.UnitTests.BuildingBlocks;

/// <summary>The robot's live Nav2 costmap for the admin map: newest per robot and kind, dropped when stale.</summary>
public class LiveCostmapStoreTests
{
    [Fact]
    public void Keeps_the_newest_image_per_robot_and_kind_and_forgets_stale_ones()
    {
        var clock = new FakeTimeProvider();
        var store = new LiveCostmapStore(clock);
        store.Put("RBT-001", """{"kind":"global","width":2,"height":1,"data":"AAE="}""");
        store.Put("RBT-001", """{"kind":"local","width":1,"height":1,"data":"AA=="}""");
        Assert.Equal(2, store.Get("RBT-001", "global")!.Body.GetProperty("width").GetInt32());
        Assert.Equal("local", store.Get("RBT-001", "local")!.Kind);
        Assert.Null(store.Get("RBT-002", "global"));

        clock.Advance(LiveCostmapStore.MaxAge + TimeSpan.FromSeconds(1));
        Assert.Null(store.Get("RBT-001", "global"));
    }

    [Fact]
    public void Ignores_broken_or_unknown_samples()
    {
        var store = new LiveCostmapStore(new FakeTimeProvider());
        store.Put("RBT-001", "not json");
        store.Put("RBT-001", """{"kind":"weird"}""");
        Assert.Null(store.Get("RBT-001", "global"));
    }

    [Fact]
    public void The_costmap_topic_is_an_uplink_kind() =>
        Assert.True(RobotMqttTopics.TryParse("warotrans/v1/robots/RBT-002/costmap", "warotrans/v1", out var code, out var kind)
                    && code == "RBT-002" && kind == RobotMqttTopics.CostmapSuffix);
}
