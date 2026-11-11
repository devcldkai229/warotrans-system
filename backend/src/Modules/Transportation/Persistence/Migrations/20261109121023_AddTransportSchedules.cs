using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.Transportation.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTransportSchedules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "transport_schedules",
                schema: "transportation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    warehouse_id = table.Column<Guid>(type: "uuid", nullable: false),
                    map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workflow_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_storage_location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_endpoint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    destination_endpoint_id = table.Column<Guid>(type: "uuid", nullable: false),
                    destination_storage_location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    destination_level_no = table.Column<short>(type: "smallint", nullable: true),
                    max_containers_per_wave = table.Column<int>(type: "integer", nullable: false),
                    recurrence = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    local_time = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    days_of_week_mask = table.Column<int>(type: "integer", nullable: false),
                    timezone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ends_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_transport_schedules", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "transport_waves",
                schema: "transportation",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    transport_schedule_id = table.Column<Guid>(type: "uuid", nullable: false),
                    planned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: true),
                    container_count = table.Column<int>(type: "integer", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    processed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_transport_waves", x => x.id);
                    table.ForeignKey(
                        name: "f_k_transport_waves_transport_schedules_transport_schedule_id",
                        column: x => x.transport_schedule_id,
                        principalSchema: "transportation",
                        principalTable: "transport_schedules",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_transport_schedules_status",
                schema: "transportation",
                table: "transport_schedules",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "i_x_transport_waves_status_planned_at",
                schema: "transportation",
                table: "transport_waves",
                columns: new[] { "status", "planned_at" });

            migrationBuilder.CreateIndex(
                name: "i_x_transport_waves_transport_schedule_id_planned_at",
                schema: "transportation",
                table: "transport_waves",
                columns: new[] { "transport_schedule_id", "planned_at" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "transport_waves",
                schema: "transportation");

            migrationBuilder.DropTable(
                name: "transport_schedules",
                schema: "transportation");
        }
    }
}
