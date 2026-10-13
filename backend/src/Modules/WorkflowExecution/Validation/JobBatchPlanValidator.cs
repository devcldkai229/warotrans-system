using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.WorkflowExecution.Validation;

/// <summary>
/// Validates JobBatchPlan as an INTERNAL planning/provisioning contract against an ExecutionSnapshot.
/// Never accept a plan directly from the Staff frontend.
/// </summary>
public static class JobBatchPlanValidator
{
    public static IReadOnlyList<JobPlanValidationError> Validate(
        TransportRequestExecutionSnapshot request,
        IReadOnlyList<JobBatchPlan> batches)
    {
        var errors = new List<JobPlanValidationError>();

        if (batches.Count == 0)
        {
            errors.Add(new("batches_required", "batches", "At least one JobBatchPlan is required."));
            return errors;
        }

        var detailsByContainer = new Dictionary<Guid, TransportRequestDetailSnapshot>();
        for (var di = 0; di < request.Details.Count; di++)
        {
            var detail = request.Details[di];
            if (detailsByContainer.ContainsKey(detail.ContainerId))
            {
                errors.Add(new(
                    "duplicate_container_in_request",
                    $"details[{di}].containerId",
                    $"Duplicate ContainerId '{detail.ContainerId}' in TransportRequest details is not allowed."));
            }
            else
            {
                detailsByContainer[detail.ContainerId] = detail;
            }
        }

        var seenBatchKeys = new HashSet<string>(StringComparer.Ordinal);
        var seenBatchSequences = new HashSet<int>();
        var containersInAnyBatch = new HashSet<Guid>();

        for (var bi = 0; bi < batches.Count; bi++)
        {
            var batch = batches[bi];
            var batchPath = $"batches[{bi}]";

            if (string.IsNullOrWhiteSpace(batch.BatchKey))
            {
                errors.Add(new("batch_key_required", $"{batchPath}.batchKey", "BatchKey is required."));
            }
            else if (!seenBatchKeys.Add(batch.BatchKey.Trim()))
            {
                errors.Add(new(
                    "duplicate_batch_key",
                    $"{batchPath}.batchKey",
                    $"Duplicate BatchKey '{batch.BatchKey}'."));
            }

            if (batch.SequenceNo <= 0)
            {
                errors.Add(new(
                    "batch_sequence_invalid",
                    $"{batchPath}.sequenceNo",
                    "Batch SequenceNo must be greater than 0."));
            }
            else if (!seenBatchSequences.Add(batch.SequenceNo))
            {
                errors.Add(new(
                    "duplicate_batch_sequence",
                    $"{batchPath}.sequenceNo",
                    $"Duplicate Batch SequenceNo '{batch.SequenceNo}'."));
            }

            if (batch.ContainerIds.Count == 0)
            {
                errors.Add(new(
                    "batch_containers_required",
                    $"{batchPath}.containerIds",
                    $"Batch '{batch.BatchKey}' must include at least one ContainerId."));
            }

            var batchSet = new HashSet<Guid>();
            for (var ci = 0; ci < batch.ContainerIds.Count; ci++)
            {
                var containerId = batch.ContainerIds[ci];
                if (!batchSet.Add(containerId))
                {
                    errors.Add(new(
                        "duplicate_container_in_batch",
                        $"{batchPath}.containerIds[{ci}]",
                        $"Duplicate ContainerId '{containerId}' in batch '{batch.BatchKey}'."));
                    continue;
                }

                if (!detailsByContainer.ContainsKey(containerId))
                {
                    errors.Add(new(
                        "batch_invalid_container",
                        $"{batchPath}.containerIds[{ci}]",
                        $"Batch '{batch.BatchKey}' references unknown ContainerId '{containerId}'."));
                }

                if (!containersInAnyBatch.Add(containerId))
                {
                    errors.Add(new(
                        "container_in_multiple_batches",
                        $"{batchPath}.containerIds[{ci}]",
                        $"ContainerId '{containerId}' appears in more than one batch."));
                }
            }

            if (batch.Stops.Count == 0)
            {
                errors.Add(new(
                    "batch_stops_required",
                    $"{batchPath}.stops",
                    $"Batch '{batch.BatchKey}' must include at least one stop."));
                continue;
            }

            var seenStopSequences = new HashSet<int>();
            var pickupByContainer = new Dictionary<Guid, int>();
            var dropoffByContainer = new Dictionary<Guid, int>();

            for (var si = 0; si < batch.Stops.Count; si++)
            {
                var stop = batch.Stops[si];
                var stopPath = $"{batchPath}.stops[{si}]";

                if (stop.SequenceNo <= 0)
                {
                    errors.Add(new(
                        "stop_sequence_invalid",
                        $"{stopPath}.sequenceNo",
                        "Stop SequenceNo must be greater than 0."));
                }
                else if (!seenStopSequences.Add(stop.SequenceNo))
                {
                    errors.Add(new(
                        "duplicate_stop_sequence",
                        $"{stopPath}.sequenceNo",
                        $"Duplicate Stop SequenceNo '{stop.SequenceNo}' in batch '{batch.BatchKey}'."));
                }

                if (stop.EndpointId == Guid.Empty)
                {
                    errors.Add(new(
                        "stop_endpoint_required",
                        $"{stopPath}.endpointId",
                        $"Stop {stop.SequenceNo} in batch '{batch.BatchKey}' requires EndpointId."));
                }

                if (stop.ContainerIds.Count == 0)
                {
                    errors.Add(new(
                        "stop_containers_required",
                        $"{stopPath}.containerIds",
                        $"Stop {stop.SequenceNo} in batch '{batch.BatchKey}' requires ContainerIds."));
                }

                for (var sci = 0; sci < stop.ContainerIds.Count; sci++)
                {
                    var containerId = stop.ContainerIds[sci];
                    var containerPath = $"{stopPath}.containerIds[{sci}]";

                    if (!batchSet.Contains(containerId))
                    {
                        errors.Add(new(
                            "stop_container_not_in_batch",
                            containerPath,
                            $"Stop {stop.SequenceNo} container '{containerId}' is not in batch '{batch.BatchKey}'."));
                        continue;
                    }

                    if (!detailsByContainer.TryGetValue(containerId, out var detail))
                    {
                        continue;
                    }

                    if (stop.Action == JobStopAction.PICKUP)
                    {
                        if (stop.EndpointId != Guid.Empty && stop.EndpointId != detail.SourceEndpointId)
                        {
                            errors.Add(new(
                                "pickup_endpoint_mismatch",
                                $"{stopPath}.endpointId",
                                $"PICKUP stop {stop.SequenceNo} endpoint does not match source endpoint of container '{containerId}'."));
                        }

                        if (!pickupByContainer.TryAdd(containerId, stop.SequenceNo))
                        {
                            errors.Add(new(
                                "duplicate_pickup",
                                containerPath,
                                $"Container '{containerId}' has more than one PICKUP stop."));
                        }
                    }
                    else if (stop.Action == JobStopAction.DROPOFF)
                    {
                        if (stop.EndpointId != Guid.Empty && stop.EndpointId != detail.DestinationEndpointId)
                        {
                            errors.Add(new(
                                "dropoff_endpoint_mismatch",
                                $"{stopPath}.endpointId",
                                $"DROPOFF stop {stop.SequenceNo} endpoint does not match destination endpoint of container '{containerId}'."));
                        }

                        if (!dropoffByContainer.TryAdd(containerId, stop.SequenceNo))
                        {
                            errors.Add(new(
                                "duplicate_dropoff",
                                containerPath,
                                $"Container '{containerId}' has more than one DROPOFF stop."));
                        }
                    }
                }
            }

            foreach (var containerId in batchSet)
            {
                if (!pickupByContainer.ContainsKey(containerId))
                {
                    errors.Add(new(
                        "missing_pickup",
                        $"{batchPath}.containerIds",
                        $"Container '{containerId}' is missing a PICKUP stop."));
                }

                if (!dropoffByContainer.ContainsKey(containerId))
                {
                    errors.Add(new(
                        "missing_dropoff",
                        $"{batchPath}.containerIds",
                        $"Container '{containerId}' is missing a DROPOFF stop."));
                }

                if (pickupByContainer.TryGetValue(containerId, out var pickupSeq)
                    && dropoffByContainer.TryGetValue(containerId, out var dropoffSeq)
                    && dropoffSeq <= pickupSeq)
                {
                    errors.Add(new(
                        "dropoff_before_pickup",
                        $"{batchPath}.stops",
                        $"Container '{containerId}' has DROPOFF (seq {dropoffSeq}) before or at PICKUP (seq {pickupSeq})."));
                }
            }
        }

        return errors;
    }

    public static void ValidateOrThrow(
        TransportRequestExecutionSnapshot request,
        IReadOnlyList<JobBatchPlan> batches)
    {
        var errors = Validate(request, batches);
        if (errors.Count > 0)
        {
            throw new JobPlanValidationException(errors);
        }
    }
}
