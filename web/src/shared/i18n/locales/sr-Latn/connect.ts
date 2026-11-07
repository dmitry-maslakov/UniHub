import type en from '../en/connect';
import type { Messages } from '../../messages';

export default {
  title: 'Poveži AI',
  description:
    'Dozvoli AI aplikaciji da čita tvoje predmete u tvoje ime: samo čitanje, i ovde je možeš isključiti kad god hoćeš.',
  keys: {
    title: 'API ključevi',
    description:
      'Za aplikacije koje ne umeju same da se prijave. Ključ ističe posle 90 dana, a promena lozinke opoziva sve ključeve.',
    new: {
      label: 'Novi ključ',
      placeholder: 'Claude na mom laptopu',
      required: 'Nazovi ključ po mestu gde ga koristiš',
      action: 'Napravi ključ',
      failed: 'Pravljenje ključa nije uspelo. Pokušaj ponovo.',
    },
    freshSession:
      'Za pravljenje API ključa potrebna je prijava u poslednja 24 sata. Vratićeš se pravo ovde.',
    created: {
      title: 'Kopiraj novi ključ odmah',
      body: 'Kasnije ga više nećeš videti. Nalepi ga u podešavanja aplikacije.',
      copy: 'Kopiraj ključ',
    },
    list: {
      aria: 'Tvoji API ključevi',
      title: 'Tvoji ključevi',
    },
    unnamed: 'Ključ bez imena',
    meta: {
      created: 'Napravljen {{date}}',
      expires: 'Ističe {{date}}',
      used: 'Poslednja upotreba {{date}}',
      neverUsed: 'Nije korišćen',
    },
    loading: 'Učitavaju se tvoji ključevi',
    empty: {
      title: 'Još nema ključeva',
      body: 'Nazovi ga po aplikaciji ili računaru za koji je, da znaš koji da opozoveš.',
    },
    revoke: {
      action: 'Opozovi',
      aria: 'Opozovi {{name}}',
      confirm: {
        title: 'Opozvati „{{name}}”?',
        body: 'Sve što koristi ovaj ključ odmah gubi pristup. Ovo se ne može poništiti.',
        action: 'Opozovi ključ',
      },
      failed: 'Opozivanje ključa nije uspelo. Pokušaj ponovo.',
    },
    notify: {
      revoked: 'Ključ je opozvan. Aplikacije koje ga koriste su odjavljene.',
    },
  },
} satisfies Messages<typeof en>;
