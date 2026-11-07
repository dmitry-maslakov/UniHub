import type en from '../en/shell';
import type { Messages } from '../../messages';

export default {
  title: '{{page}} · UniHub',
  nav: {
    aria: 'Glavna navigacija',
    myCourses: 'Moji predmeti',
    search: 'Pretraga',
    sources: 'Izvori',
    connect: 'Poveži AI',
    admin: 'Administracija',
    open: 'Otvori navigaciju',
    close: 'Zatvori navigaciju',
  },
  userMenu: {
    open: 'Meni naloga: {{name}}',
    account: 'Nalog',
    theme: 'Izgled',
    light: 'Svetli',
    dark: 'Tamni',
    system: 'Kao u sistemu',
    language: 'Jezik',
    privacy: 'Privatnost',
    signOut: 'Odjavi se',
    version: 'Verzija {{version}}',
  },
  language: {
    label: 'Jezik',
    sr: 'Srpski (latinica)',
    en: 'English',
    srShort: 'SR',
    enShort: 'EN',
  },
  colorScheme: {
    toLight: 'Pređi na svetli izgled',
    toDark: 'Pređi na tamni izgled',
  },
  footer: {
    privacy: 'Privatnost',
  },
  notFound: {
    title: 'Stranica nije pronađena',
    description: 'Link je možda star ili pogrešno ukucan.',
    home: 'Idi na Moje predmete',
  },
} satisfies Messages<typeof en>;
