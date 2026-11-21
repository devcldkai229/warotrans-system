import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { readAuthorizedIssuePhotoDataUrl } from '../../shared/api';
import { t } from '../../shared/i18n';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Text } from '../../shared/ui';

export function AuthorizedEvidencePhoto({ uri }: { uri: string }) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [attempt, setAttempt] = useState(0);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    readAuthorizedIssuePhotoDataUrl(uri, controller.signal)
      .then((nextUrl) => {
        if (!controller.signal.aborted) {
          setDataUrl(nextUrl);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [uri, attempt]);

  return (
    <View style={styles.card}>
      {loading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : failed || !dataUrl ? (
        <View style={styles.placeholder}>
          <Text variant="caption" color="warningText">{t('Could not load photo')}</Text>
          <Button
            title="Retry"
            variant="outline"
            size="sm"
            onPress={() => setAttempt(v => v + 1)}
          />
        </View>
      ) : (
        <Image
          source={{ uri: dataUrl }}
          resizeMode="cover"
          accessibilityLabel={t('Photo Evidence ({count}/{max})', { count: 1, max: 4 })}
          style={styles.image}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      width: '100%',
      height: 170,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 12,
    },
  });
