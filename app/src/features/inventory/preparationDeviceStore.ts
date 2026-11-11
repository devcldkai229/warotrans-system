import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createPreparationStorage } from './preparationStorage';

export const preparationDeviceStore = createPreparationStorage({
  async get(key) { return Platform.OS === 'web' && typeof window !== 'undefined' ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key); },
  async set(key, value) { if (Platform.OS === 'web' && typeof window !== 'undefined') window.localStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value); },
  async remove(key) { if (Platform.OS === 'web' && typeof window !== 'undefined') window.localStorage.removeItem(key); else await SecureStore.deleteItemAsync(key); },
});
