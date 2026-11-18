import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, Crosshair } from 'lucide-react-native';
import type { EndpointDto } from '../api/navigationApi';
import { getUserErrorMessage } from '../api/client';
import type { ThemeColors } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';
import { radii } from '../theme/radii';
import { typography } from '../theme/typography';
import { Button, Text } from '../ui';
import { localizeEndpointOptions } from './localizeOptions';

interface RobotLocalizePanelProps {
  robotCode: string;
  isOnline: boolean;
  localizationStatus?: string | null;
  mapVersionId: string;
  endpoints: EndpointDto[];
  /** Resolves when the server accepted the LOCALIZE command (202); throws the server error otherwise. */
  onLocalize: (endpointId: string) => Promise<void>;
}

/**
 * LOCALIZE: tell the robot it stands at a map point where someone placed it (after power-on or being moved by hand).
 * Accepted (202) is not localized: the robot reports LOCALIZED in its telemetry once its pose estimate converged.
 */
export function RobotLocalizePanel({ robotCode, isOnline, localizationStatus, mapVersionId, endpoints, onLocalize }: RobotLocalizePanelProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const options = useMemo(() => localizeEndpointOptions(endpoints, mapVersionId), [endpoints, mapVersionId]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const chosen = options.find(endpoint => endpoint.id === selected);

  const send = async () => {
    if (!chosen || busy) return;
    setBusy(true); setError(null);
    try { await onLocalize(chosen.id); setSentTo(chosen.code); setOpen(false); }
    catch (failure) { setError(getUserErrorMessage(failure, 'The robot could not be localized.')); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.box}>
      {sentTo ? <Text variant="caption" color={localizationStatus === 'LOCALIZED' ? colors.successText : colors.textSecondary}>
        {localizationStatus === 'LOCALIZED' ? `${robotCode} is localized (set at ${sentTo}).` : `Sent: ${robotCode} stands at ${sentTo}. Waiting for the robot to confirm…`}
      </Text> : null}
      {!open ? (
        <Button title="Localize Robot Here…" variant="outline" size="md" icon={Crosshair} fullWidth disabled={!isOnline}
          onPress={() => { setOpen(true); setError(null); }} />
      ) : (
        <>
          <Text variant="caption" color={colors.textSecondary}>Where does {robotCode} stand right now? Pick the point it was placed on.</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
            {options.map(endpoint => (
              <Pressable key={endpoint.id} onPress={() => setSelected(endpoint.id)} accessibilityRole="radio"
                accessibilityState={{ selected: endpoint.id === selected }} accessibilityLabel={`Endpoint ${endpoint.code}`}
                style={[styles.option, endpoint.id === selected && styles.optionOn]}>
                <Text variant="bodyMedium" style={styles.code}>{endpoint.code}</Text>
                {endpoint.id === selected ? <Check size={16} color={colors.primaryText} /> : null}
              </Pressable>
            ))}
            {!options.length ? <Text variant="caption">This map has no enabled points.</Text> : null}
          </ScrollView>
          <Button title={chosen ? `Localize At ${chosen.code}` : 'Pick A Point'} variant="primary" size="md" fullWidth
            disabled={!chosen || !isOnline} loading={busy} onPress={send} />
          <Button title="Close" variant="ghost" size="md" fullWidth onPress={() => setOpen(false)} disabled={busy} />
        </>
      )}
      {!isOnline ? <Text variant="caption" color={colors.textSecondary}>The robot is offline; it cannot be localized now.</Text> : null}
      {error ? <Text variant="body" color={colors.dangerText}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  box: { gap: 8 },
  list: { maxHeight: 260 },
  listContent: { gap: 6 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12,
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  code: { fontFamily: typography.fontMono },
});
