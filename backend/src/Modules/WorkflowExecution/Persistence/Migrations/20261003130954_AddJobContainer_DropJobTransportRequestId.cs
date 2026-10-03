using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJobContainer_DropJobTransportRequestId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_jobs_transport_request_id",
                schema: "execution",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "transport_request_id",
                schema: "execution",
                table: "jobs");

            migrationBuilder.CreateTable(
                name: "job_containers",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence_no = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    loaded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    delivered_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_job_containers", x => x.id);
                    table.ForeignKey(
                        name: "f_k_job_containers_jobs_job_id",
                        column: x => x.job_id,
                        principalSchema: "execution",
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_job_containers_container_id",
                schema: "execution",
                table: "job_containers",
                column: "container_id");

            migrationBuilder.CreateIndex(
                name: "i_x_job_containers_job_id_container_id",
                schema: "execution",
                table: "job_containers",
                columns: new[] { "job_id", "container_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_job_containers_job_id_sequence_no",
                schema: "execution",
                table: "job_containers",
                columns: new[] { "job_id", "sequence_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_job_containers_status",
                schema: "execution",
                table: "job_containers",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "i_x_job_containers_transport_request_id",
                schema: "execution",
                table: "job_containers",
                column: "transport_request_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_containers",
                schema: "execution");

            migrationBuilder.AddColumn<Guid>(
                name: "transport_request_id",
                schema: "execution",
                table: "jobs",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "i_x_jobs_transport_request_id",
                schema: "execution",
                table: "jobs",
                column: "transport_request_id",
                unique: true);
        }
    }
}
