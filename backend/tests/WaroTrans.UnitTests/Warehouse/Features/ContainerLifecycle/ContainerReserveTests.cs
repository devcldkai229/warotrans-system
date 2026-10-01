using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;

namespace WaroTrans.UnitTests.Warehouse.Features.ContainerLifecycle;

public class ContainerReserveTests
{
    [Fact]
    public void Reserve_from_CREATED_sets_RESERVED()
    {
        var container = new Container
        {
            Id = Guid.NewGuid(),
            Status = ContainerStatus.CREATED,
            UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(-1)
        };

        container.Reserve();

        Assert.Equal(ContainerStatus.RESERVED, container.Status);
    }

    [Fact]
    public void Reserve_from_non_CREATED_throws()
    {
        var container = new Container
        {
            Id = Guid.NewGuid(),
            Status = ContainerStatus.STORED
        };

        Assert.Throws<DomainValidationException>(() => container.Reserve());
    }
}
