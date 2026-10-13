using FluentValidation;

namespace WaroTrans.WorkflowExecution.Features.CreateWorkflow;

public sealed class CreateWorkflowValidator : AbstractValidator<CreateWorkflowRequest>
{
    public CreateWorkflowValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Description).MaximumLength(500).When(x => x.Description is not null);
    }
}
