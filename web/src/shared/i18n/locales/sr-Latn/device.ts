import type en from '../en/device';
import type { Messages } from '../../messages';

export default {
  title: 'Prijava na drugom ekranu',
  description:
    'Odobri računar ili TV koji prikazuje kod za prijavu, bez kucanja lozinke na njemu.',
  form: {
    label: 'Kod sa ekrana',
    invalid: 'Unesi kod koji ekran prikazuje',
    action: 'Nastavi',
  },
  lookingUp: 'Proverava se kod',
  expired: 'Taj kod je istekao. Počni ponovo na ekranu da dobiješ novi.',
  unknown: 'Taj kod ne postoji. Uporedi ga sa ekranom i unesi ponovo.',
  asks: '{{app}} traži prijavu kao <strong>{{email}}</strong>.',
  codeAria: 'Kod {{spelled}}',
  warning:
    'Odobri samo ako je ovaj kod upravo na ekranu ispred tebe. Neko ko ti je poslao kod ne vidi tvoje predmete ako ga ne odobriš.',
  approve: 'Odobri',
  deny: 'Odbij',
  failed: 'Slanje odgovora nije uspelo. Pokušaj ponovo.',
  freshSession:
    'Za odobravanje ekrana potrebna je prijava u poslednja 24 sata. Vratićeš se pravo ovde.',
  approved: {
    title: 'Odobreno',
    body: 'Ekran će se za trenutak sam prijaviti. Možeš da zatvoriš ovu stranicu.',
  },
  denied: {
    title: 'Odbijeno',
    body: 'Ekran neće biti prijavljen. Ako je to greška, počni ponovo na njemu.',
  },
  app: {
    web: 'UniHub u pregledaču',
    native: 'Aplikacija UniHub',
    other: 'Aplikacija',
  },
} satisfies Messages<typeof en>;
