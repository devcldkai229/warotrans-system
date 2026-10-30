using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Navigation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DropEdgeZoneCapacityAddEdgeName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_zones_capacity_positive",
                schema: "navigation",
                table: "zones");

            migrationBuilder.DropCheckConstraint(
                name: "ck_edges_capacity_positive",
                schema: "navigation",
                table: "edges");

            migrationBuilder.DropColumn(
                name: "capacity",
                schema: "navigation",
                table: "zones");

            migrationBuilder.DropColumn(
                name: "capacity",
                schema: "navigation",
                table: "edges");

            migrationBuilder.AddColumn<string>(
                name: "name",
                schema: "navigation",
                table: "edges",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            // Existing edges had no name; use the persisted code so Name is meaningful and NOT NULL.
            migrationBuilder.Sql(
                """
                UPDATE navigation.edges SET name = code WHERE name = '' OR name IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "name",
                schema: "navigation",
                table: "edges");

            migrationBuilder.AddColumn<int>(
                name: "capacity",
                schema: "navigation",
                table: "zones",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "capacity",
                schema: "navigation",
                table: "edges",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddCheckConstraint(
                name: "ck_zones_capacity_positive",
                schema: "navigation",
                table: "zones",
                sql: "capacity >= 1");

            migrationBuilder.AddCheckConstraint(
                name: "ck_edges_capacity_positive",
                schema: "navigation",
                table: "edges",
                sql: "capacity >= 1");
        }
    }
}
