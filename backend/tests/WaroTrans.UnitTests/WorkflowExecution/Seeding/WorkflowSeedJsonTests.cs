using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Seeding;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.UnitTests.WorkflowExecution.Seeding;

public sealed class WorkflowSeedJsonTests
{
    private static string SeedDirectory()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "seed", "workflows");
            if (Directory.Exists(candidate)) return candidate;
        }

        throw new DirectoryNotFoundException("backend/seed/workflows");
    }

    [Fact]
    public void The_shipped_seed_files_read_and_pass_the_draft_rules()
    {
        var definitions = WorkflowSeedJson.ReadDirectory(SeedDirectory());

        Assert.Equal(
            ["INBOUND", "INTERNAL_RELOCATION", "OUTBOUND_RETRIEVAL", "ROBOT_CHARGING", "ROBOT_RETURN_TO_PARK"],
            definitions.Select(d => d.Code));
        Assert.All(definitions.SelectMany(d => d.Variables).Where(v => v.Source == WorkflowVariableSource.ADMIN_INPUT),
            v => Assert.Null(v.ConfiguredValue));
        var inbound = definitions.Single(d => d.Code == "INBOUND");
        Assert.Contains(inbound.Tasks, t => t.TaskKey == "QUALITY_INSPECTION" && t.RunCondition?.VariableKey == "checkQuality");
        Assert.Contains(inbound.Variables, v => v.Key == "inspectionEndpointId" && v.Format == "WAYPOINT");
    }

    [Fact]
    public void A_shipped_seed_is_a_draft_an_admin_must_complete_before_publishing()
    {
        var inbound = WorkflowSeedJson.ReadDirectory(SeedDirectory()).Single(d => d.Code == "INBOUND");
        var model = WorkflowMapping.ToDefinitionModel(inbound);

        Assert.True(WorkflowDefinitionValidator.ValidateDraft(model).IsValid);
        Assert.Contains(WorkflowDefinitionValidator.ValidateForPublish(model).Errors, e => e.Path.EndsWith(".configuredValue", StringComparison.Ordinal));
    }

    [Fact]
    public void Admin_values_in_a_file_are_dropped()
    {
        const string json = """
            {
              "code": "X", "name": "X",
              "variables": [
                { "key": "assignedRobotId", "name": "a", "dataType": "UUID", "source": "SYSTEM_VALUE", "isRequired": true, "sequenceNo": 0 },
                { "key": "spot", "name": "s", "dataType": "UUID", "source": "ADMIN_INPUT", "isRequired": true, "sequenceNo": 1,
                  "format": "WAYPOINT", "configuredValue": "63bf21ec-f8ec-421a-a28a-5f8f158fb1fa" }
              ],
              "tasks": []
            }
            """;

        var definition = WorkflowSeedJson.Read("x.json", json);

        Assert.Null(definition.Variables[1].ConfiguredValue);
        Assert.Equal("WAYPOINT", definition.Variables[1].Format);
    }

    [Fact]
    public void A_broken_file_is_named_with_its_line()
    {
        var error = Assert.Throws<WorkflowSeedFileException>(() => WorkflowSeedJson.Read("bad.json", "{\n  \"code\": \"X\",\n  \"tasks\": [ oops ]\n}"));

        Assert.Equal("bad.json", error.File);
        Assert.Contains("line 3", error.Message);
    }

    [Fact]
    public void A_file_breaking_the_draft_rules_is_refused()
    {
        var error = Assert.Throws<WorkflowSeedFileException>(() => WorkflowSeedJson.Read("dup.json",
            """{ "code": "X", "name": "X", "variables": [ { "key": "a", "name": "a", "dataType": "UUID", "source": "STAFF_INPUT", "sequenceNo": 0 }, { "key": "a", "name": "a", "dataType": "UUID", "source": "STAFF_INPUT", "sequenceNo": 1 } ], "tasks": [] }"""));

        Assert.Contains("Duplicate variable key", error.Message);
    }

    [Fact]
    public void Writing_a_stored_workflow_and_reading_it_back_keeps_the_definition_without_admin_values()
    {
        var source = WorkflowSeedJson.ReadDirectory(SeedDirectory()).Single(d => d.Code == "OUTBOUND_RETRIEVAL");
        var stored = new Workflow { Id = Guid.NewGuid(), Code = source.Code, VersionNo = 3 };
        var model = WorkflowMapping.ToDefinitionModel(source);
        model.Variables.First(v => v.Source == WorkflowVariableSource.ADMIN_INPUT).ConfiguredValue = JsonSerializer.SerializeToElement(Guid.NewGuid());
        WorkflowMapping.ApplyDefinition(stored, model);

        var again = WorkflowSeedJson.Read("round.json", WorkflowSeedJson.Write(stored));

        Assert.DoesNotContain("versionNo", WorkflowSeedJson.Write(stored));
        Assert.All(again.Variables.Where(v => v.Source == WorkflowVariableSource.ADMIN_INPUT), v => Assert.Null(v.ConfiguredValue));
        Assert.Equal(source.Tasks.SelectMany(t => t.Steps).Select(s => s.StepKey), again.Tasks.SelectMany(t => t.Steps).Select(s => s.StepKey));
    }
}
