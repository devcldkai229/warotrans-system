using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJobContainerRequestContainerUnique : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "i_x_job_containers_transport_request_id_container_id",
                schema: "execution",
                table: "job_containers",
                columns: new[] { "transport_request_id", "container_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "i_x_job_containers_transport_request_id_container_id",
                schema: "execution",
                table: "job_containers");
        }
    }
}
