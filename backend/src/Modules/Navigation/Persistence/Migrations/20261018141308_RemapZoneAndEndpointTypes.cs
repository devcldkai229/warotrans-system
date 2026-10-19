using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Navigation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemapZoneAndEndpointTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE navigation.zones SET zone_type = CASE zone_type
                    WHEN 'RESTRICTED_AREA' THEN 'KEEP_OUT'
                    WHEN 'NARROW_AREA' THEN 'SINGLE_OCCUPANCY'
                    WHEN 'INTERSECTION' THEN 'NO_STOP'
                    WHEN 'OPERATIONAL_AREA' THEN 'SPEED'
                    ELSE zone_type
                END
                WHERE zone_type IN ('RESTRICTED_AREA', 'NARROW_AREA', 'INTERSECTION', 'OPERATIONAL_AREA');

                UPDATE navigation.endpoints SET endpoint_type = CASE endpoint_type
                    WHEN 'CHARGING' THEN 'CHARGER'
                    WHEN 'PARKING' THEN 'PARK'
                    WHEN 'INBOUND' THEN 'WAYPOINT'
                    WHEN 'STORAGE' THEN 'WAYPOINT'
                    WHEN 'OUTBOUND' THEN 'WAYPOINT'
                    WHEN 'MAINTENANCE' THEN 'WAYPOINT'
                    WHEN 'INSPECTION' THEN 'WAYPOINT'
                    WHEN 'RECOVERY' THEN 'WAYPOINT'
                    WHEN 'TRANSIT' THEN 'WAYPOINT'
                    ELSE endpoint_type
                END
                WHERE endpoint_type IN (
                    'CHARGING', 'PARKING', 'INBOUND', 'STORAGE', 'OUTBOUND',
                    'MAINTENANCE', 'INSPECTION', 'RECOVERY', 'TRANSIT');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE navigation.zones SET zone_type = CASE zone_type
                    WHEN 'KEEP_OUT' THEN 'RESTRICTED_AREA'
                    WHEN 'SINGLE_OCCUPANCY' THEN 'NARROW_AREA'
                    WHEN 'NO_STOP' THEN 'INTERSECTION'
                    WHEN 'SPEED' THEN 'OPERATIONAL_AREA'
                    ELSE zone_type
                END
                WHERE zone_type IN ('KEEP_OUT', 'SINGLE_OCCUPANCY', 'NO_STOP', 'SPEED');

                UPDATE navigation.endpoints SET endpoint_type = CASE endpoint_type
                    WHEN 'CHARGER' THEN 'CHARGING'
                    WHEN 'PARK' THEN 'PARKING'
                    WHEN 'WAYPOINT' THEN 'TRANSIT'
                    ELSE endpoint_type
                END
                WHERE endpoint_type IN ('CHARGER', 'PARK', 'WAYPOINT');
                """);
        }
    }
}
