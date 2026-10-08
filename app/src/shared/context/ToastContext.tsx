import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  type?: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
  info: (message: string, description?: string) => void;
  success: (message: string, description?: string) => void;
  warning: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

type ToastListener = (options: ToastOptions) => void;
let toastListener: ToastListener | null = null;

export const toast = {
  info: (message: string, description?: string) => {
    toastListener?.({ type: 'info', message, description });
  },
  success: (message: string, description?: string) => {
    toastListener?.({ type: 'success', message, description });
  },
  warning: (message: string, description?: string) => {
    toastListener?.({ type: 'warning', message, description });
  },
  error: (message: string, description?: string) => {
    toastListener?.({ type: 'error', message, description });
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const animValue = useRef(new Animated.Value(0)).current;

  const hideToast = () => {
    Animated.timing(animValue, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setCurrentToast(null);
    });
  };

  const showToast = (options: ToastOptions) => {
    setCurrentToast(options);
    animValue.setValue(0);
    Animated.spring(animValue, {
      toValue: 1,
      tension: 80,
      friction: 9,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    toastListener = showToast;
    return () => {
      toastListener = null;
    };
  }, []);

  useEffect(() => {
    if (!currentToast) return;
    const duration = currentToast.duration ?? 3200;
    const timer = setTimeout(() => {
      hideToast();
    }, duration);
    return () => clearTimeout(timer);
  }, [currentToast]);

  const info = (msg: string, desc?: string) => showToast({ type: 'info', message: msg, description: desc });
  const success = (msg: string, desc?: string) => showToast({ type: 'success', message: msg, description: desc });
  const warning = (msg: string, desc?: string) => showToast({ type: 'warning', message: msg, description: desc });
  const error = (msg: string, desc?: string) => showToast({ type: 'error', message: msg, description: desc });

  const translateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 0],
  });

  const opacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const toastType = currentToast?.type || 'info';

  return (
    <ToastContext.Provider value={{ showToast, hideToast, info, success, warning, error }}>
      {children}

      {/* Floating Sonner-Style Toast Banner */}
      {currentToast && (
        <View style={styles.toastContainer} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.toastCard,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <Pressable onPress={hideToast} style={styles.toastPressable}>
              <View style={styles.iconCol}>
                {toastType === 'info' && <Info size={16} color={colors.textPrimary} />}
                {toastType === 'success' && <CheckCircle2 size={16} color={colors.success} />}
                {toastType === 'warning' && <AlertTriangle size={16} color={colors.warning} />}
                {toastType === 'error' && <AlertOctagon size={16} color={colors.danger} />}
              </View>

              <View style={styles.textCol}>
                <Text style={styles.toastMessage} numberOfLines={2}>
                  {currentToast.message}
                </Text>
                {currentToast.description ? (
                  <Text style={styles.toastDesc} numberOfLines={2}>
                    {currentToast.description}
                  </Text>
                ) : null}
              </View>

              <View style={styles.closeCol}>
                <X size={14} color={colors.textMuted} />
              </View>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  toastCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 12,
  },
  toastPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
  },
  iconCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  toastMessage: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  toastDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    marginTop: 2,
  },
  closeCol: {
    paddingLeft: 4,
  },
});
