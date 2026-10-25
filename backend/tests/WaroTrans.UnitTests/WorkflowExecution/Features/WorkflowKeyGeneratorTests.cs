using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.UnitTests.WorkflowExecution.Features;

public class WorkflowKeyGeneratorTests
{
    [Theory]
    [InlineData("Inbound Putaway", "INBOUND_PUTAWAY")]
    [InlineData("  pick-up   container! ", "PICK_UP_CONTAINER")]
    [InlineData("Giao hàng đến kho", "GIAO_HANG_DEN_KHO")]
    [InlineData("Step 2 (final)", "STEP_2_FINAL")]
    [InlineData("___", "")]
    [InlineData("", "")]
    public void Slug_is_upper_ascii_words_joined_by_one_underscore(string name, string expected)
    {
        Assert.Equal(expected, WorkflowKeyGenerator.Slug(name, 100));
    }

    [Fact]
    public void Slug_is_cut_to_the_column_length_without_a_dangling_underscore()
    {
        var slug = WorkflowKeyGenerator.Slug("AAAA BBBB", 5);

        Assert.Equal("AAAA", slug);
    }

    [Fact]
    public void Unique_adds_a_numeric_suffix_until_the_name_is_free()
    {
        var taken = new HashSet<string> { "PICK", "PICK_2" };

        Assert.Equal("PICK_3", WorkflowKeyGenerator.Unique("PICK", 150, taken.Contains));
        Assert.Equal("DROP", WorkflowKeyGenerator.Unique("DROP", 150, taken.Contains));
    }

    [Fact]
    public void Unique_keeps_the_suffix_inside_the_length_limit()
    {
        var taken = new HashSet<string> { "ABCDEFGH" };

        var key = WorkflowKeyGenerator.Unique("ABCDEFGH", 8, taken.Contains);

        Assert.Equal("ABCDEF_2", key);
    }

    [Fact]
    public void Code_falls_back_when_the_name_has_no_usable_characters()
    {
        Assert.Equal("WORKFLOW", WorkflowKeyGenerator.GenerateCode("!!!", _ => false));
        Assert.Equal("WORKFLOW_2", WorkflowKeyGenerator.GenerateCode("???", code => code == "WORKFLOW"));
    }

    [Fact]
    public void Missing_keys_are_generated_and_the_ones_already_there_are_kept()
    {
        var model = new WorkflowDefinitionModel
        {
            Tasks =
            [
                new WorkflowTaskModel
                {
                    TaskKey = "KEEP_ME",
                    Name = "First",
                    Steps =
                    [
                        new WorkflowStepModel { StepKey = "LOAD", Name = "Load" },
                        new WorkflowStepModel { StepKey = "", Name = "Load" }
                    ]
                },
                new WorkflowTaskModel
                {
                    TaskKey = "",
                    Name = "First",
                    Steps = [new WorkflowStepModel { StepKey = "", Name = "Load" }, new WorkflowStepModel { Name = "" }]
                },
                new WorkflowTaskModel { TaskKey = "", Name = "" }
            ]
        };

        WorkflowKeyGenerator.FillMissingKeys(model);

        Assert.Equal(["KEEP_ME", "FIRST", "TASK"], model.Tasks.Select(t => t.TaskKey));
        // Step keys are unique across the whole workflow, not per task: LOAD is kept, so the other two "Load" get suffixes.
        Assert.Equal(["LOAD", "LOAD_2"], model.Tasks[0].Steps.Select(s => s.StepKey));
        Assert.Equal(["LOAD_3", "STEP"], model.Tasks[1].Steps.Select(s => s.StepKey));
    }

    [Fact]
    public void A_generated_key_never_takes_one_the_caller_sent_for_a_later_item()
    {
        var model = new WorkflowDefinitionModel
        {
            Tasks =
            [
                new WorkflowTaskModel { TaskKey = "", Name = "Move" },
                new WorkflowTaskModel { TaskKey = "MOVE", Name = "Other" }
            ]
        };

        WorkflowKeyGenerator.FillMissingKeys(model);

        Assert.Equal(["MOVE_2", "MOVE"], model.Tasks.Select(t => t.TaskKey));
    }
}
