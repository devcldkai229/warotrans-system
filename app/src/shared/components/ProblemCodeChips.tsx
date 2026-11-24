import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ContainerProblem } from '../containerProblems';
import { t } from '../i18n';
import type { ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { useThemedStyles } from '../theme/ThemeContext';
import { Text } from '../ui';

interface Props {
  problems: ContainerProblem[];
  selected: string[];
  onChange: (codes: string[]) => void;
  /** Several problems at once (a failed inspection); otherwise one. */
  multiple?: boolean;
  disabled?: boolean;
}

/** Container problem codes to choose from, each with what it means. */
export function ProblemCodeChips({ problems, selected, onChange, multiple = false, disabled = false }: Props) {
  const { styles } = useThemedStyles(createStyles);
  const toggle = (code: string) => {
    if (disabled) return;
    if (!multiple) { onChange(selected[0] === code ? [] : [code]); return; }
    onChange(selected.includes(code) ? selected.filter(item => item !== code) : [...selected, code]);
  };
  return <View style={styles.list} accessibilityRole={multiple ? undefined : 'radiogroup'}>
    {problems.map(problem => {
      const on = selected.includes(problem.code);
      return <Pressable key={problem.code} onPress={() => toggle(problem.code)} disabled={disabled}
        style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
        accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: on, disabled }}
        accessibilityLabel={t(problem.label)}>
        <Text variant="bodyMedium" fontWeight="700" color={on ? 'primaryText' : 'textPrimary'}>
          {t(problem.label)}{problem.blocksHandover ? ` · ${t('Blocks Confirm')}` : ''}
        </Text>
        <Text variant="caption" color="textSecondary">{t(problem.hint)}</Text>
      </Pressable>;
    })}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  list: { gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 2 },
  chipOn: { borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight },
  pressed: { opacity: 0.85 },
});
