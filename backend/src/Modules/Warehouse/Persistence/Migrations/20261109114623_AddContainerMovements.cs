using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Warehouse.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContainerMovements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "container_movements",
                schema: "warehouse",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    from_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    to_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    from_storage_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    from_level_no = table.Column<short>(type: "smallint", nullable: true),
                    to_storage_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    to_level_no = table.Column<short>(type: "smallint", nullable: true),
                    job_id = table.Column<Guid>(type: "uuid", nullable: true),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    idempotency_key = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    actor_account_id = table.Column<Guid>(type: "uuid", nullable: true),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_container_movements", x => x.id);
                    table.ForeignKey(
                        name: "f_k_container_movements_containers_container_id",
                        column: x => x.container_id,
                        principalSchema: "warehouse",
                        principalTable: "containers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_container_movements_container_id_occurred_at",
                schema: "warehouse",
                table: "container_movements",
                columns: new[] { "container_id", "occurred_at" });

            migrationBuilder.CreateIndex(
                name: "i_x_container_movements_idempotency_key",
                schema: "warehouse",
                table: "container_movements",
                column: "idempotency_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "container_movements",
                schema: "warehouse");
        }
    }
}
