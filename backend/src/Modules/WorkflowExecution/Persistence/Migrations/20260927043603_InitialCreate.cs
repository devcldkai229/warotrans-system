using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WaroTrans.WorkflowExecution.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "execution");

            migrationBuilder.CreateTable(
                name: "jobs",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_no = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    transport_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workflow_id = table.Column<Guid>(type: "uuid", nullable: false),
                    map_version_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    context_values = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    queued_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    failure_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    failure_message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_jobs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "workflows",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    version_no = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    variables_schema = table.Column<string>(type: "jsonb", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_workflows", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "job_tasks",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workflow_task_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence_no = table.Column<int>(type: "integer", nullable: false),
                    context_values = table.Column<string>(type: "jsonb", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    failure_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_job_tasks", x => x.id);
                    table.ForeignKey(
                        name: "f_k_job_tasks_jobs_job_id",
                        column: x => x.job_id,
                        principalSchema: "execution",
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workflow_tasks",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workflow_id = table.Column<Guid>(type: "uuid", nullable: false),
                    task_key = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    sequence_no = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_workflow_tasks", x => x.id);
                    table.ForeignKey(
                        name: "f_k_workflow_tasks_workflows_workflow_id",
                        column: x => x.workflow_id,
                        principalSchema: "execution",
                        principalTable: "workflows",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "job_steps",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_task_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workflow_step_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sequence_no = table.Column<int>(type: "integer", nullable: false),
                    step_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    resolved_inputs = table.Column<string>(type: "jsonb", nullable: false),
                    output_values = table.Column<string>(type: "jsonb", nullable: false),
                    target_endpoint_id = table.Column<Guid>(type: "uuid", nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    error_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    error_message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_job_steps", x => x.id);
                    table.ForeignKey(
                        name: "f_k_job_steps_job_tasks_job_task_id",
                        column: x => x.job_task_id,
                        principalSchema: "execution",
                        principalTable: "job_tasks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workflow_steps",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workflow_task_id = table.Column<Guid>(type: "uuid", nullable: false),
                    step_key = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    step_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    sequence_no = table.Column<int>(type: "integer", nullable: false),
                    input_bindings = table.Column<string>(type: "jsonb", nullable: false),
                    timeout_seconds = table.Column<int>(type: "integer", nullable: false),
                    max_attempts = table.Column<int>(type: "integer", nullable: false),
                    retry_backoff_seconds = table.Column<int>(type: "integer", nullable: false),
                    on_failure = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_workflow_steps", x => x.id);
                    table.ForeignKey(
                        name: "f_k_workflow_steps_workflow_tasks_workflow_task_id",
                        column: x => x.workflow_task_id,
                        principalSchema: "execution",
                        principalTable: "workflow_tasks",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "handover_confirmations",
                schema: "execution",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_step_id = table.Column<Guid>(type: "uuid", nullable: false),
                    container_id = table.Column<Guid>(type: "uuid", nullable: false),
                    confirmed_by = table.Column<Guid>(type: "uuid", nullable: false),
                    handover_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    confirmed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    evidence = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_handover_confirmations", x => x.id);
                    table.ForeignKey(
                        name: "f_k_handover_confirmations_job_steps_job_step_id",
                        column: x => x.job_step_id,
                        principalSchema: "execution",
                        principalTable: "job_steps",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "i_x_handover_confirmations_job_step_id",
                schema: "execution",
                table: "handover_confirmations",
                column: "job_step_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_job_steps_job_task_id",
                schema: "execution",
                table: "job_steps",
                column: "job_task_id");

            migrationBuilder.CreateIndex(
                name: "i_x_job_tasks_job_id",
                schema: "execution",
                table: "job_tasks",
                column: "job_id");

            migrationBuilder.CreateIndex(
                name: "i_x_jobs_job_no",
                schema: "execution",
                table: "jobs",
                column: "job_no",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_jobs_transport_request_id",
                schema: "execution",
                table: "jobs",
                column: "transport_request_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "i_x_workflow_steps_workflow_task_id",
                schema: "execution",
                table: "workflow_steps",
                column: "workflow_task_id");

            migrationBuilder.CreateIndex(
                name: "i_x_workflow_tasks_workflow_id",
                schema: "execution",
                table: "workflow_tasks",
                column: "workflow_id");

            migrationBuilder.CreateIndex(
                name: "i_x_workflows_code_version_no",
                schema: "execution",
                table: "workflows",
                columns: new[] { "code", "version_no" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "handover_confirmations",
                schema: "execution");

            migrationBuilder.DropTable(
                name: "workflow_steps",
                schema: "execution");

            migrationBuilder.DropTable(
                name: "job_steps",
                schema: "execution");

            migrationBuilder.DropTable(
                name: "workflow_tasks",
                schema: "execution");

            migrationBuilder.DropTable(
                name: "job_tasks",
                schema: "execution");

            migrationBuilder.DropTable(
                name: "workflows",
                schema: "execution");

            migrationBuilder.DropTable(
                name: "jobs",
                schema: "execution");
        }
    }
}
