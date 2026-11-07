import type en from '../en/consent';
import type { Messages } from '../../messages';

export default {
  head: 'Poveži aplikaciju',
  title: '{{requester}} želi da čita tvoje predmete',
  named:
    'Predstavlja se kao „{{name}}”. Dozvoli samo ako je to aplikacija koju upravo koristiš.',
  unnamed: 'Dozvoli samo ako je to aplikacija koju upravo koristiš.',
  can: {
    title: 'Moći će da',
    read: 'čita i pretražuje tvoje predmete, objave i fajlove (samo čitanje)',
    stay: 'ostane povezana dok ne promeniš lozinku, ili 30 dana od poslednje upotrebe',
  },
  hourOnly: 'Povezano sat vremena; posle toga aplikacija te ponovo pita.',
  returnTo: 'Vratićeš se na <strong>{{host}}</strong>',
  notEncrypted: '(nije šifrovano)',
  loopback: {
    title: 'Ovo te vraća na ovaj računar',
    body: 'Pristup dobija samo program na ovom računaru. Dozvoli samo ako je taj program upravo pokrenut na tvoj zahtev.',
  },
  allow: 'Dozvoli',
  deny: 'Odbij',
  failed:
    'To nije prošlo. Zahtev je možda istekao: vrati se u aplikaciju i poveži se ponovo.',
  signedInAs: 'Prijavljeni nalog: {{email}}.',
  notYou: 'Nisi ti?',
  missing: {
    title: 'Nema šta da se odobri',
    description:
      'Ova stranica se otvara iz aplikacije koja traži povezivanje, a link koji je poslala nedostaje ili je istekao. Vrati se u aplikaciju i poveži se ponovo.',
    back: 'Idi na Moje predmete',
  },
} satisfies Messages<typeof en>;
