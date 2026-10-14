using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Navigation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMapVersionRosMetadataAndGeometryContracts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<JsonDocument>(
                name: "policy",
                schema: "navigation",
                table: "zones",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "policy_schema_version",
                schema: "navigation",
                table: "zones",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "code",
                schema: "navigation",
                table: "map_versions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "content_hash",
                schema: "navigation",
                table: "map_versions",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "frame_id",
                schema: "navigation",
                table: "map_versions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "map");

            migrationBuilder.AddColumn<double>(
                name: "free_threshold",
                schema: "navigation",
                table: "map_versions",
                type: "double precision",
                nullable: false,
                defaultValue: 0.25);

            migrationBuilder.AddColumn<int>(
                name: "image_height_pixels",
                schema: "navigation",
                table: "map_versions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "image_width_pixels",
                schema: "navigation",
                table: "map_versions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "map_yaml_uri",
                schema: "navigation",
                table: "map_versions",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "negate",
                schema: "navigation",
                table: "map_versions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "occupied_threshold",
                schema: "navigation",
                table: "map_versions",
                type: "double precision",
                nullable: false,
                defaultValue: 0.65);

            migrationBuilder.AddColumn<string>(
                name: "preview_image_uri",
                schema: "navigation",
                table: "map_versions",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "width_meters",
                schema: "navigation",
                table: "edges",
                type: "double precision",
                nullable: false,
                defaultValue: 1.0);

            migrationBuilder.AddCheckConstraint(
                name: "ck_zones_capacity_positive",
                schema: "navigation",
                table: "zones",
                sql: "capacity >= 1");

            // Backfill unique codes for existing rows before creating the unique index.
            migrationBuilder.Sql(
                """
                UPDATE navigation.map_versions
                SET code = 'MAP-' || LEFT(REPLACE(warehouse_id::text, '-', ''), 8) || '-V' || LPAD(version_no::text, 3, '0')
                WHERE code IS NULL OR code = '';
                """);

            migrationBuilder.CreateIndex(
                name: "i_x_map_versions_warehouse_id_code",
                schema: "navigation",
                table: "map_versions",
                columns: new[] { "warehouse_id", "code" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_edges_capacity_positive",
                schema: "navigation",
                table: "edges",
                sql: "capacity >= 1");

            migrationBuilder.AddCheckConstraint(
                name: "ck_edges_width_meters_positive",
                schema: "navigation",
                table: "edges",
                sql: "width_meters > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_zones_capacity_positive",
                schema: "navigation",
                table: "zones");

            migrationBuilder.DropIndex(
                name: "i_x_map_versions_warehouse_id_code",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_edges_capacity_positive",
                schema: "navigation",
                table: "edges");

            migrationBuilder.DropCheckConstraint(
                name: "ck_edges_width_meters_positive",
                schema: "navigation",
                table: "edges");

            migrationBuilder.DropColumn(
                name: "policy",
                schema: "navigation",
                table: "zones");

            migrationBuilder.DropColumn(
                name: "policy_schema_version",
                schema: "navigation",
                table: "zones");

            migrationBuilder.DropColumn(
                name: "code",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "content_hash",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "frame_id",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "free_threshold",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "image_height_pixels",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "image_width_pixels",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "map_yaml_uri",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "negate",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "occupied_threshold",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "preview_image_uri",
                schema: "navigation",
                table: "map_versions");

            migrationBuilder.DropColumn(
                name: "width_meters",
                schema: "navigation",
                table: "edges");
        }
    }
}
