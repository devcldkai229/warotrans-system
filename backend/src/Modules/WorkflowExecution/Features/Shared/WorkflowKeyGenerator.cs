using System.Globalization;
using System.Text;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Features.Shared;

/// <summary>
/// Makes the identifiers nobody should have to type: a Workflow's Code and its Task / Step keys. They come from the
/// display name (<c>"Pick up container"</c> → <c>PICK_UP_CONTAINER</c>) and get <c>_2</c>, <c>_3</c> … when the name is
/// already taken. A key or code the caller already has is never touched, which keeps the references to it (a step
/// output binding points at a Step key) valid when a Workflow is saved again.
/// </summary>
public static class WorkflowKeyGenerator
{
    public const int MaxCodeLength = 100;
    public const int MaxKeyLength = 150;

    public const string CodeFallback = "WORKFLOW";
    public const string TaskKeyFallback = "TASK";
    public const string StepKeyFallback = "STEP";

    /// <summary>Upper-case ASCII letters and digits joined by single underscores; accents are dropped (đ → D).</summary>
    public static string Slug(string? text, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var slug = new StringBuilder();
        var pendingSeparator = false;
        foreach (var raw in text.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(raw) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            var ch = raw is 'đ' or 'Đ' ? 'D' : raw;
            if (ch is (>= 'a' and <= 'z') or (>= 'A' and <= 'Z') or (>= '0' and <= '9'))
            {
                if (pendingSeparator && slug.Length > 0)
                {
                    slug.Append('_');
                }

                slug.Append(char.ToUpperInvariant(ch));
                pendingSeparator = false;
            }
            else
            {
                pendingSeparator = true;
            }
        }

        var result = slug.ToString();
        return result.Length <= maxLength ? result : result[..maxLength].TrimEnd('_');
    }

    /// <summary>The first of <c>baseKey</c>, <c>baseKey_2</c>, <c>baseKey_3</c> … that is not taken, within the column length.</summary>
    public static string Unique(string baseKey, int maxLength, Func<string, bool> isTaken)
    {
        if (!isTaken(baseKey))
        {
            return baseKey;
        }

        for (var n = 2; ; n++)
        {
            var suffix = $"_{n}";
            var head = baseKey.Length + suffix.Length > maxLength
                ? baseKey[..(maxLength - suffix.Length)].TrimEnd('_')
                : baseKey;
            var candidate = head + suffix;
            if (!isTaken(candidate))
            {
                return candidate;
            }
        }
    }

    /// <summary>The code a new Workflow gets from its name, free among <paramref name="takenCodes"/>.</summary>
    public static string GenerateCode(string name, Func<string, bool> isTaken)
    {
        var slug = Slug(name, MaxCodeLength);
        return Unique(slug.Length == 0 ? CodeFallback : slug, MaxCodeLength, isTaken);
    }

    /// <summary>
    /// Gives every Task and Step without a key one. Keys already in the model are reserved first, so a generated key
    /// never collides with one the caller sent for another item; Step keys are unique across the whole Workflow.
    /// </summary>
    public static void FillMissingKeys(WorkflowDefinitionModel model)
    {
        var taskKeys = new HashSet<string>(
            model.Tasks.Where(t => !string.IsNullOrWhiteSpace(t.TaskKey)).Select(t => t.TaskKey),
            StringComparer.Ordinal);
        var stepKeys = new HashSet<string>(
            model.Tasks.SelectMany(t => t.Steps).Where(s => !string.IsNullOrWhiteSpace(s.StepKey)).Select(s => s.StepKey),
            StringComparer.Ordinal);

        foreach (var task in model.Tasks)
        {
            if (string.IsNullOrWhiteSpace(task.TaskKey))
            {
                var slug = Slug(task.Name, MaxKeyLength);
                task.TaskKey = Unique(slug.Length == 0 ? TaskKeyFallback : slug, MaxKeyLength, taskKeys.Contains);
                taskKeys.Add(task.TaskKey);
            }

            foreach (var step in task.Steps.Where(s => string.IsNullOrWhiteSpace(s.StepKey)))
            {
                var slug = Slug(step.Name, MaxKeyLength);
                step.StepKey = Unique(slug.Length == 0 ? StepKeyFallback : slug, MaxKeyLength, stepKeys.Contains);
                stepKeys.Add(step.StepKey);
            }
        }
    }
}
