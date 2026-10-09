using System.Globalization;
using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Validation;

public static class WorkflowDataTypeCompatibility
{
    public static bool AreCompatible(WorkflowDataType source, WorkflowDataType target) =>
        source == target
        || (source == WorkflowDataType.INTEGER && target == WorkflowDataType.DECIMAL);

    public static bool TryParse(JsonElement value, WorkflowDataType expected, out string? error)
    {
        error = null;
        try
        {
            switch (expected)
            {
                case WorkflowDataType.STRING:
                    if (value.ValueKind is JsonValueKind.String)
                    {
                        return true;
                    }

                    error = "Expected STRING.";
                    return false;

                case WorkflowDataType.INTEGER:
                    if (value.ValueKind is JsonValueKind.Number && value.TryGetInt64(out _))
                    {
                        return true;
                    }

                    if (value.ValueKind is JsonValueKind.String
                        && long.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out _))
                    {
                        return true;
                    }

                    error = "Expected INTEGER.";
                    return false;

                case WorkflowDataType.DECIMAL:
                    if (value.ValueKind is JsonValueKind.Number && value.TryGetDecimal(out _))
                    {
                        return true;
                    }

                    if (value.ValueKind is JsonValueKind.String
                        && decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out _))
                    {
                        return true;
                    }

                    error = "Expected DECIMAL.";
                    return false;

                case WorkflowDataType.BOOLEAN:
                    if (value.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    {
                        return true;
                    }

                    if (value.ValueKind is JsonValueKind.String
                        && bool.TryParse(value.GetString(), out _))
                    {
                        return true;
                    }

                    error = "Expected BOOLEAN.";
                    return false;

                case WorkflowDataType.UUID:
                    if (value.ValueKind is JsonValueKind.String && Guid.TryParse(value.GetString(), out _))
                    {
                        return true;
                    }

                    error = "Expected UUID.";
                    return false;

                case WorkflowDataType.DATETIME:
                    if (value.ValueKind is JsonValueKind.String
                        && DateTimeOffset.TryParse(value.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _))
                    {
                        return true;
                    }

                    error = "Expected DATETIME.";
                    return false;

                default:
                    error = $"Unsupported data type '{expected}'.";
                    return false;
            }
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool IsAllowedValue(JsonElement value, IReadOnlyList<string>? allowedValues)
    {
        if (allowedValues is null || allowedValues.Count == 0)
        {
            return true;
        }

        var text = value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.ToString(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => value.ToString()
        };

        return allowedValues.Any(a => string.Equals(a, text, StringComparison.Ordinal));
    }
}
