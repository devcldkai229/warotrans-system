using Amazon.SQS;
using Amazon.SQS.Model;

namespace WaroTrans.Evidence.Queues;

/// <summary>SQS Standard queues (at least once, any order); their DLQs are configured by Terraform (redrive policy).</summary>
public sealed class SqsWorkQueue(IAmazonSQS sqs, EvidenceQueueOptions options) : IWorkQueue
{
    private string Url(string queue) =>
        options.Urls.TryGetValue(queue, out var url) && !string.IsNullOrWhiteSpace(url)
            ? url
            : throw new InvalidOperationException($"{EvidenceQueueOptions.SectionName}:Urls:{queue} is not configured.");

    public Task SendAsync(string queue, string body, CancellationToken cancellationToken) =>
        sqs.SendMessageAsync(new SendMessageRequest(Url(queue), body), cancellationToken);

    public async Task<IReadOnlyList<QueueMessage>> ReceiveAsync(string queue, int max, TimeSpan wait, TimeSpan visibility, CancellationToken cancellationToken)
    {
        var response = await sqs.ReceiveMessageAsync(new ReceiveMessageRequest
        {
            QueueUrl = Url(queue),
            MaxNumberOfMessages = Math.Clamp(max, 1, 10),
            WaitTimeSeconds = (int)Math.Clamp(wait.TotalSeconds, 0, 20),
            VisibilityTimeout = (int)Math.Clamp(visibility.TotalSeconds, 0, 43200),
            MessageSystemAttributeNames = ["ApproximateReceiveCount"]
        }, cancellationToken);
        return (response.Messages ?? [])
            .Select(m => new QueueMessage(queue, m.MessageId, m.ReceiptHandle, m.Body,
                m.Attributes is not null && m.Attributes.TryGetValue("ApproximateReceiveCount", out var count) && int.TryParse(count, out var n) ? n : 1))
            .ToList();
    }

    public Task DeleteAsync(QueueMessage message, CancellationToken cancellationToken) =>
        sqs.DeleteMessageAsync(Url(message.Queue), message.ReceiptHandle, cancellationToken);

    public Task ReleaseAsync(QueueMessage message, TimeSpan delay, CancellationToken cancellationToken) =>
        sqs.ChangeMessageVisibilityAsync(new ChangeMessageVisibilityRequest(Url(message.Queue), message.ReceiptHandle,
            (int)Math.Clamp(delay.TotalSeconds, 0, 43200)), cancellationToken);
}
