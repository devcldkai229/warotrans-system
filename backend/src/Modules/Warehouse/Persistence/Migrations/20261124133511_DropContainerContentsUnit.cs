using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DropContainerContentsUnit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_contents",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_creation_receipt",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropColumn(
                name: "contents_unit",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_contents",
                schema: "warehouse",
                table: "containers",
                sql: "contents_quantity IS NULL OR contents_quantity > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_creation_receipt",
                schema: "warehouse",
                table: "containers",
                sql: "(creation_request_id IS NULL AND creation_request_hash IS NULL AND creation_ordinal IS NULL AND creation_group_key IS NULL AND creation_group_ordinal IS NULL) OR (creation_request_id IS NOT NULL AND creation_request_hash IS NOT NULL AND length(creation_request_hash) = 64 AND creation_ordinal IS NOT NULL AND creation_ordinal > 0 AND creation_group_key IS NOT NULL AND length(btrim(creation_group_key)) > 0 AND creation_group_ordinal IS NOT NULL AND creation_group_ordinal > 0 AND contents_quantity IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_contents",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_containers_creation_receipt",
                schema: "warehouse",
                table: "containers");

            migrationBuilder.AddColumn<string>(
                name: "contents_unit",
                schema: "warehouse",
                table: "containers",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            // The unit was not kept: a box that says how many goods it holds gets a neutral one back.
            migrationBuilder.Sql("UPDATE warehouse.containers SET contents_unit = 'pcs' WHERE contents_quantity IS NOT NULL;");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_contents",
                schema: "warehouse",
                table: "containers",
                sql: "(contents_quantity IS NULL AND contents_unit IS NULL) OR (contents_quantity IS NOT NULL AND contents_quantity > 0 AND contents_unit IS NOT NULL AND length(btrim(contents_unit)) > 0)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_containers_creation_receipt",
                schema: "warehouse",
                table: "containers",
                sql: "(creation_request_id IS NULL AND creation_request_hash IS NULL AND creation_ordinal IS NULL AND creation_group_key IS NULL AND creation_group_ordinal IS NULL) OR (creation_request_id IS NOT NULL AND creation_request_hash IS NOT NULL AND length(creation_request_hash) = 64 AND creation_ordinal IS NOT NULL AND creation_ordinal > 0 AND creation_group_key IS NOT NULL AND length(btrim(creation_group_key)) > 0 AND creation_group_ordinal IS NOT NULL AND creation_group_ordinal > 0 AND contents_quantity IS NOT NULL AND contents_unit IS NOT NULL)");
        }
    }
}
