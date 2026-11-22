import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LogIn,
  Monitor,
  Moon,
  Sun,
  User,
} from 'lucide-react-native';
import { BrandMark } from '../../shared/components/BrandMark';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { useLanguage } from '../../shared/i18n/LanguageContext';
import { colors, ThemeColors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useTheme, useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import { useToast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { useAuth } from './authContext';

export function LoginScreen() {
  const { loginAsync } = useAuth();
  const { success: showToastSuccess } = useToast();
  const { mode, cycleMode } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!username.trim()) {
      triggerHaptic('error');
      setPasswordError(null);
      setError(t('Staff Username is required.'));
      return;
    }
    if (!password) {
      triggerHaptic('error');
      setError(null);
      setPasswordError(t('Access Password is required.'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPasswordError(null);

    try {
      const session = await loginAsync(username, password);
      triggerHaptic('success');
      showToastSuccess(
        t('Signed in as {name}', {
          name: session.fullName,
        }),
      );
    } catch (err: any) {
      triggerHaptic('error');
      const msg = err?.message || t('Authentication failed. Please verify credentials.');
      setError(t(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const modeLabel = t(mode === 'system' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light');
  const langLabel = language === 'vi' ? 'Tiếng Việt' : 'English';

  return (
    <View style={styles.outerWrapper}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.container, { paddingTop: topInset }]}>
          {/* Top Section with high stacking context to overlay over actionSection */}
          <View style={styles.topSection}>
            <View style={styles.themeBar}>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  toggleLanguage();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('Language: {lang}. Tap to switch language.', { lang: langLabel })}
                style={({ pressed }) => [styles.themeCyclePill, pressed && styles.themeCyclePillPressed]}
              >
                <Globe size={13} color={colors.primaryText} strokeWidth={2.2} />
                <Text style={styles.themeCycleLabel}>
                  {language === 'vi' ? 'Tiếng Việt' : 'English'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  cycleMode();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('Appearance: {mode}. Tap to switch theme.', { mode: modeLabel })}
                style={({ pressed }) => [styles.themeCyclePill, pressed && styles.themeCyclePillPressed]}
              >
                {mode === 'system' ? (
                  <Monitor size={13} color={colors.textSecondary} strokeWidth={2.2} />
                ) : mode === 'dark' ? (
                  <Moon size={13} color={colors.primaryText} strokeWidth={2.2} />
                ) : (
                  <Sun size={13} color={colors.warningText} strokeWidth={2.2} />
                )}
                <Text style={styles.themeCycleLabel}>
                  {modeLabel}
                </Text>
              </Pressable>
            </View>

            {/* Centered Brand Hero */}
            <View style={styles.brandHero}>
              <View style={styles.logoBadgeWrap}>
                <BrandMark size={68} />
              </View>
              <Text style={styles.brandTitle}>WaroTrans</Text>
              <Text style={styles.brandSubtitle}>{t('Warehouse Operations')}</Text>
            </View>

            {/* Form Fields */}
            <View style={styles.formSection}>
              <Input
                label={t('Staff Username')}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  if (error) setError(null);
                }}
                placeholder={t('e.g. alex.tran')}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                leftIcon={<User size={18} color={colors.textSecondary} />}
                containerStyle={styles.fieldSpacing}
                inputStyle={styles.identifierInput}
                error={error ? t(error) : undefined}
              />

              <Input
                label={t('Access Password')}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError(null);
                }}
                placeholder={t('Enter password')}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                leftIcon={<Lock size={18} color={colors.textSecondary} />}
                containerStyle={styles.lastFieldSpacing}
                error={passwordError ? t(passwordError) : undefined}
                rightIcon={
                  <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      setShowPassword(!showPassword);
                    }}
                    hitSlop={12}
                    style={({ pressed }) => [styles.passwordToggle, pressed && styles.passwordTogglePressed]}
                    accessibilityRole="button"
                    accessibilityLabel={t(showPassword ? 'Hide password' : 'Show password')}
                    accessibilityState={{ selected: showPassword }}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={colors.textSecondary} />
                    ) : (
                      <Eye size={18} color={colors.textSecondary} />
                    )}
                  </Pressable>
                }
              />
            </View>
          </View>

          {/* Action Section */}
          <View style={styles.actionSection}>
            {/* Error Banner */}
            {error && (
              <View style={styles.errorAlert}>
                <AlertCircle size={16} color={colors.danger} style={styles.errorAlertIcon} />
                <Text style={styles.errorAlertText}>{t(error)}</Text>
              </View>
            )}

            <Button
              label={t(isSubmitting ? 'Signing In...' : 'Sign In')}
              icon={<LogIn size={18} color="#ffffff" strokeWidth={2.4} />}
              onPress={handleLogin}
              size="lg"
              variant="primary"
              loading={isSubmitting}
              disabled={isSubmitting}
              style={styles.submitButton}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) =>
  StyleSheet.create({
    outerWrapper: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'space-between',
    },
    container: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 0,
      paddingBottom: Platform.OS === 'ios' ? 40 : 24,
      backgroundColor: colors.background,
      justifyContent: 'space-between',
      maxWidth: 480,
      width: '100%',
      alignSelf: 'center',
      position: 'relative',
    },
    topSection: {
      position: 'relative',
      zIndex: 100,
    },
    themeBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      paddingTop: 8,
    },
    themeCyclePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 32,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    themeCyclePillPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    themeCycleLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      fontFamily: typography.fontSans,
    },
    brandHero: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: Platform.select({ android: 6, default: 10 }),
      marginBottom: 4,
    },
  logoBadgeWrap: {
    marginBottom: 14,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    textAlign: 'center',
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  formSection: {
    marginTop: 36,
    position: 'relative',
    zIndex: 100,
  },
  // 4pt vertical rhythm: 16 between fields, 32 before the primary CTA.
  // Input's own marginBottom is neutralised here via containerStyle.
  fieldSpacing: {
    marginBottom: 16,
  },
  lastFieldSpacing: {
    marginBottom: 32,
  },
  identifierInput: {
    fontFamily: typography.fontMono,
    letterSpacing: 0.4,
  },
  passwordToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  passwordTogglePressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  actionSection: {
    position: 'relative',
    zIndex: 1,
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorAlertIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  errorAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.dangerText,
    fontFamily: typography.fontSans,
  },
  submitButton: {
    width: '100%',
  },
});
