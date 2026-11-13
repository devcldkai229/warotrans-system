using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// What a movement must look like for the standard warehouse workflows (INBOUND put-away, WF-02 OUTBOUND_RETRIEVAL,
/// WF-03 INTERNAL_RELOCATION). The workflow steps cannot say it: they only bind source / destination endpoints. Checked on the
/// Details after the shelf of a bare shelf Endpoint was filled in, so naming a shelf's Endpoint counts as naming the shelf.
/// Other workflow codes are not restricted here.
/// </summary>
public static class WorkflowMovementRules
{
    public const string Inbound = "INBOUND";
    public const string InboundPutaway = "INBOUND_PUTAWAY";
    public const string OutboundRetrieval = "OUTBOUND_RETRIEVAL";
    public const string InternalRelocation = "INTERNAL_RELOCATION";

    public static void Ensure(string workflowCode, IReadOnlyList<TransportRequestDetailSnapshot> details)
    {
        foreach (var detail in details)
        {
            switch (workflowCode)
            {
                case Inbound or InboundPutaway:
                    if (detail.SourceStorageLocationId is not null)
                    {
                        throw new DomainValidationException(
                            $"Detail {detail.SequenceNo}: an inbound put-away takes the Container from the receiving point, not from a shelf. Use INTERNAL_RELOCATION to move between shelves.",
                            "inbound_source_is_storage");
                    }

                    if (detail.DestinationStorageLocationId is null)
                    {
                        throw new DomainValidationException(
                            $"Detail {detail.SequenceNo}: an inbound put-away puts the Container on a shelf; the destination is not a storage location.",
                            "inbound_destination_not_storage");
                    }

                    break;

                case OutboundRetrieval:
                    if (detail.SourceStorageLocationId is null)
                    {
                        throw new DomainValidationException(
                            $"Detail {detail.SequenceNo}: an outbound retrieval picks the Container up from its storage location; the source is not a shelf.",
                            "outbound_source_not_storage");
                    }

                    if (detail.DestinationStorageLocationId is not null)
                    {
                        throw new DomainValidationException(
                            $"Detail {detail.SequenceNo}: an outbound retrieval delivers to an outbound point, not to a shelf. Use INTERNAL_RELOCATION to move between shelves.",
                            "outbound_destination_is_storage");
                    }

                    break;

                case InternalRelocation:
                    if (detail.SourceStorageLocationId is null || detail.DestinationStorageLocationId is null)
                    {
                        throw new DomainValidationException(
                            $"Detail {detail.SequenceNo}: an internal relocation moves a Container from one shelf to another; both ends must be storage locations.",
                            "relocation_requires_storage_locations");
                    }

                    if (detail.SourceStorageLocationId == detail.DestinationStorageLocationId)
                    {
                        throw new DomainValidationException(
                            $"Detail {detail.SequenceNo}: the destination shelf is the shelf the Container is on.",
                            "relocation_same_location");
                    }

                    break;
            }
        }
    }
}
