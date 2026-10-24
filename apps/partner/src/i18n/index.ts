import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';

const LANGUAGE_KEY = 'lunchbox.language';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: getLocales()[0]?.languageCode === 'hi' ? 'hi' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// A language the partner picked in the app wins over the device locale; it is a preference, not a secret.
void AsyncStorage.getItem(LANGUAGE_KEY)
  .then((saved) => {
    if ((saved === 'en' || saved === 'hi') && saved !== i18n.language) void i18n.changeLanguage(saved);
  })
  .catch(() => undefined);

export async function setLanguage(language: 'en' | 'hi'): Promise<void> {
  await i18n.changeLanguage(language);
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
}

export default i18n;
