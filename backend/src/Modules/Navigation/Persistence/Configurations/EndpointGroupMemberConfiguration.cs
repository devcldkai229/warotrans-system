using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Persistence.Configurations;

public sealed class EndpointGroupMemberConfiguration : IEntityTypeConfiguration<EndpointGroupMember>
{
    public void Configure(EntityTypeBuilder<EndpointGroupMember> builder)
    {
        builder.ToTable("endpoint_group_members");
        builder.HasKey(x => new { x.EndpointGroupId, x.EndpointId });

        builder.HasIndex(x => x.EndpointId);
    }
}
