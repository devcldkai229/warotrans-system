import React from 'react';
import { ActionModal, Button, Text } from '../../shared/ui';
export type IncidentCategory = 'CONTAINER_DAMAGED' | 'BARCODE_UNREADABLE' | 'SHELF_BLOCKED' | 'QUANTITY_MISMATCH' | 'AMR_PATH_BLOCKED';
export function IssueReportingModal({ visible, onClose, jobId }: {
  visible: boolean; onClose: () => void; jobId?: string; robotCode?: string;
}) {
  return <ActionModal visible={visible} onClose={onClose} title="Report An Issue">
    {jobId && <Text variant="code">Job: {jobId}</Text>}
    <Text>The Operations Issue Reporting Endpoint Is Not Available On The Server. No Report, Photo Or Recovery Request Has Been Submitted.</Text>
    <Button title="Submit Report (Unavailable)" disabled onPress={() => {}} />
  </ActionModal>;
}
