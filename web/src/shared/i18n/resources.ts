import enAccount from './locales/en/account';
import enAdmin from './locales/en/admin';
import enAuth from './locales/en/auth';
import enCommon from './locales/en/common';
import enConnect from './locales/en/connect';
import enConsent from './locales/en/consent';
import enCourses from './locales/en/courses';
import enDevice from './locales/en/device';
import enFile from './locales/en/file';
import enPost from './locales/en/post';
import enPrivacy from './locales/en/privacy';
import enSearch from './locales/en/search';
import enShell from './locales/en/shell';
import enSources from './locales/en/sources';
import srAccount from './locales/sr-Latn/account';
import srAdmin from './locales/sr-Latn/admin';
import srAuth from './locales/sr-Latn/auth';
import srCommon from './locales/sr-Latn/common';
import srConnect from './locales/sr-Latn/connect';
import srConsent from './locales/sr-Latn/consent';
import srCourses from './locales/sr-Latn/courses';
import srDevice from './locales/sr-Latn/device';
import srFile from './locales/sr-Latn/file';
import srPost from './locales/sr-Latn/post';
import srPrivacy from './locales/sr-Latn/privacy';
import srSearch from './locales/sr-Latn/search';
import srShell from './locales/sr-Latn/shell';
import srSources from './locales/sr-Latn/sources';

// Every text the app shows, by language and namespace (one per area). The
// English files are the model: a translation has the same keys.
export const resources = {
  en: {
    common: enCommon,
    shell: enShell,
    auth: enAuth,
    device: enDevice,
    consent: enConsent,
    courses: enCourses,
    post: enPost,
    file: enFile,
    search: enSearch,
    sources: enSources,
    connect: enConnect,
    account: enAccount,
    admin: enAdmin,
    privacy: enPrivacy,
  },
  'sr-Latn': {
    common: srCommon,
    shell: srShell,
    auth: srAuth,
    device: srDevice,
    consent: srConsent,
    courses: srCourses,
    post: srPost,
    file: srFile,
    search: srSearch,
    sources: srSources,
    connect: srConnect,
    account: srAccount,
    admin: srAdmin,
    privacy: srPrivacy,
  },
};

export type Namespace = keyof typeof resources.en;
export const namespaces = Object.keys(resources.en) as Namespace[];
