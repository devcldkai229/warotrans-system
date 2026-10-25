import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { StatusPill, Text } from '../../shared/ui';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import type { JobStatus } from '../../shared/types/contracts';
import type { AppJobTaskItem } from './jobData';
import { formatJobTime, JobStepper } from './JobStepper';

interface JobTaskDetailSheetProps {
  task: AppJobTaskItem;
  jobNo: string;
  jobStatus: JobStatus;
  onClose: () => void;
}

export function JobTaskDetailSheet({ task, jobNo, jobStatus, onClose }: JobTaskDetailSheetProps) {
  const completed = task.steps.filter(step => step.status === 'COMPLETED').length;
  return (
    <BottomSheet onClose={onClose}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text variant="caption">Task {task.sequenceNo} · {jobNo}</Text>
          <Text variant="title" accessibilityRole="header">{task.title}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close task details"><X size={20} color={colors.textSecondary} /></Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <StatusPill status={task.status} dot />
          <Text variant="body">{completed}/{task.steps.length} Steps Completed</Text>
          {task.endpointCode ? <Text variant="body">Location: {task.endpointCode}</Text> : null}
          {task.containerCodes.length ? <Text variant="body">Containers: {task.containerCodes.join(', ')}</Text> : null}
          {task.startedAt ? <Text variant="caption">Started: {formatJobTime(task.startedAt)}</Text> : null}
          {task.completedAt ? <Text variant="caption">Completed: {formatJobTime(task.completedAt)}</Text> : null}
          {task.failureCode ? <Text variant="body" color={colors.dangerText}>{task.failureCode}</Text> : null}
        </View>
        {jobStatus === 'PAUSED' ? <View style={styles.paused}><Text variant="body" color={colors.warningText}>Job Paused · Execution Is On Hold</Text></View> : null}
        <Text variant="headline">Execution Steps</Text>
        <JobStepper steps={task.steps} endpointCode={task.endpointCode} />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  heading: { flex: 1, minWidth: 0, gap: 4 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16 },
  summary: { padding: 14, gap: 10, backgroundColor: colors.surfaceSubtle, borderRadius: radii.md },
  paused: { padding: 12, backgroundColor: colors.warningBg, borderRadius: radii.md },
});
