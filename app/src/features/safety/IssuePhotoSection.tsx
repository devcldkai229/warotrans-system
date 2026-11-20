import React, { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { StyleSheet, View } from 'react-native';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
import { getUserErrorMessage, uploadIssuePhoto } from '../../shared/api';
import { t } from '../../shared/i18n';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import type { IssueReportResponse } from '../../shared/types/contracts';
import { Button, Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { AuthorizedEvidencePhoto } from './AuthorizedEvidencePhoto';
import {
  createIssuePhotoId,
  decodeBase64ToBytes,
  isIssuePhotoPath,
  MAX_ISSUE_PHOTOS,
  validatePhotoUploadBytes,
  type IssuePhotoMimeType,
} from './issuePhotoData';

export interface IssuePhotoSectionProps {
  issue: Pick<IssueReportResponse, 'id' | 'version' | 'status' | 'evidence'>;
  canUpload: boolean;
  onUploaded?: (updated: IssueReportResponse) => Promise<unknown> | void;
  onRefreshIssue?: () => Promise<unknown> | void;
}

interface PendingIssuePhoto {
  photoId: string;
  bytes: Uint8Array;
  mimeType: IssuePhotoMimeType;
}

export function IssuePhotoSection({
  issue,
  canUpload,
  onUploaded,
  onRefreshIssue,
}: IssuePhotoSectionProps) {
  const styles = useThemedStyles(createStyles);
  const [pendingPhoto, setPendingPhoto] = useState<PendingIssuePhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    setPendingPhoto(null);
    setPhotoError(null);
  }, [issue.id]);

  const photoItems = (issue.evidence ?? []).filter(
    ev => ev.kind === 'PHOTO' && isIssuePhotoPath(ev.uri),
  );
  const canAttachPhoto =
    canUpload && issue.status !== 'CLOSED' && photoItems.length < MAX_ISSUE_PHOTOS;

  if (!photoItems.length && !canAttachPhoto && !pendingPhoto && !photoError) {
    return null;
  }

  const uploadPhotoCandidate = async (candidate: PendingIssuePhoto) => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const updated = await uploadIssuePhoto(
        issue.id,
        candidate.photoId,
        issue.version,
        candidate.bytes,
        candidate.mimeType,
      );
      triggerHaptic('success');
      setPendingPhoto(null);
      await onUploaded?.(updated);
    } catch (failure) {
      setPhotoError(
        getUserErrorMessage(
          failure,
          'Photo upload failed; your ticket was kept so you can retry safely.',
        ),
      );
      void onRefreshIssue?.();
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePickPhoto = async (source: 'camera' | 'library') => {
    if (!canAttachPhoto || photoBusy) return;
    triggerHaptic('tap');
    setPhotoError(null);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setPhotoError(t('Camera permission is required to take an evidence photo.'));
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setPhotoError(t('Photo library permission is required to select an evidence photo.'));
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      let bytes: Uint8Array;
      if (asset.base64) {
        bytes = decodeBase64ToBytes(asset.base64);
      } else if (asset.uri) {
        const fetched = await fetch(asset.uri);
        bytes = new Uint8Array(await fetched.arrayBuffer());
      } else {
        setPhotoError(t('Select a JPEG or PNG image up to 2 MiB.'));
        return;
      }

      const validation = validatePhotoUploadBytes(bytes);
      if (!validation.ok) {
        setPhotoError(t(validation.message));
        return;
      }

      const candidate: PendingIssuePhoto = {
        photoId: createIssuePhotoId(),
        bytes,
        mimeType: validation.mimeType,
      };
      setPendingPhoto(candidate);
      await uploadPhotoCandidate(candidate);
    } catch (failure) {
      setPhotoError(
        getUserErrorMessage(
          failure,
          'Photo upload failed; your ticket was kept so you can retry safely.',
        ),
      );
    }
  };

  return (
    <View style={styles.section}>
      <Text variant="label" color="textSecondary">
        {t('Photo Evidence ({count}/{max})', {
          count: photoItems.length,
          max: MAX_ISSUE_PHOTOS,
        })}
      </Text>

      {photoItems.map((ev, index) => (
        <AuthorizedEvidencePhoto key={ev.uri || `photo-${index}`} uri={ev.uri!} />
      ))}

      {photoBusy ? (
        <Text variant="caption" color="textSecondary">Uploading photo…</Text>
      ) : null}

      {photoError ? (
        <View style={styles.dangerBanner}>
          <Text variant="caption" color="dangerText">{photoError}</Text>
        </View>
      ) : null}

      {pendingPhoto ? (
        <View style={styles.actionRow}>
          <Button
            title="Retry Photo Upload"
            variant="primary"
            size="sm"
            loading={photoBusy}
            disabled={photoBusy}
            onPress={() => {
              void uploadPhotoCandidate(pendingPhoto);
            }}
            style={styles.flexBtn}
          />
          <Button
            title="Discard Photo"
            variant="outline"
            size="sm"
            disabled={photoBusy}
            onPress={() => {
              setPendingPhoto(null);
              setPhotoError(null);
            }}
            style={styles.flexBtn}
          />
        </View>
      ) : canAttachPhoto ? (
        <View style={styles.actionRow}>
          <Button
            title="Take Photo"
            icon={Camera}
            variant="outline"
            size="sm"
            disabled={photoBusy}
            onPress={() => {
              void handlePickPhoto('camera');
            }}
            style={styles.flexBtn}
          />
          <Button
            title="Choose Photo"
            icon={ImageIcon}
            variant="outline"
            size="sm"
            disabled={photoBusy}
            onPress={() => {
              void handlePickPhoto('library');
            }}
            style={styles.flexBtn}
          />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      gap: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dangerBanner: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBg,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    flexBtn: {
      flexGrow: 1,
      minWidth: 120,
    },
  });
