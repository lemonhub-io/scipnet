import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import type { TFunction } from 'i18next';
import type { Category } from '../../shared/api-types';
import { en } from './en';
import { zh } from './zh';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, zh: { translation: zh } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'agora_lang',
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (l) => {
  document.documentElement.lang = l;
});

/** Category name/description: translated for seeded slugs, falls back to the API value. */
export const catName = (t: TFunction, c: Pick<Category, 'slug' | 'name'>) =>
  t(`cats.${c.slug}.name`, { defaultValue: c.name });
export const catDesc = (t: TFunction, c: Pick<Category, 'slug' | 'description'>) =>
  t(`cats.${c.slug}.desc`, { defaultValue: c.description });

export default i18n;
