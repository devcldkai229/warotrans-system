using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Navigation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddZoneTypeJunction : Migration
    {
        /// <inheritdoc />
        /// <inheritdoc />
        /// <remarks>
        /// Application enum expansion only: ZoneType.JUNCTION is stored as varchar.
        /// No column/check remap; capacity=1 enforced in ZonePolicyValidator.
        /// </remarks>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                -- ZoneType JUNCTION allowed (navigation.zones.zone_type varchar).
                -- Policy: Capacity must be 1; free movement inside junction to transition.
                SELECT 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // No schema to revert. Existing JUNCTION rows remain valid varchar values.
        }
    }
}
