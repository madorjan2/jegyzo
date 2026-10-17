import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { hu } from './hu';

type Widened<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : Widened<T[K]>;
};

export type TranslationDict = Widened<typeof hu>;
const resources = {
  hu: { translation: hu },
  en: { translation: en },
} as const satisfies Record<string, { translation: TranslationDict }>;

void i18next.use(initReactI18next).init({
  resources,
  lng: (typeof window !== 'undefined' && (localStorage.getItem('locale') ?? 'hu')) || 'hu',
  fallbackLng: 'hu',
  interpolation: { escapeValue: false },
});

export default i18next;
