import type en from '../en/account';
import type { Messages } from '../../messages';

export default {
  title: 'Nalog',
  profile: {
    title: 'Profil',
    name: {
      label: 'Ime',
      required: 'Unesi ime',
      tooLong: 'Koristi najviše 100 znakova',
    },
    save: 'Sačuvaj ime',
    email: 'Tvoj imejl je {{email}}. Ovde se ne može promeniti.',
    notify: {
      saved: 'Ime je sačuvano.',
    },
    failed: 'Čuvanje imena nije uspelo. Pokušaj ponovo.',
  },
  password: {
    title: 'Lozinka',
    description:
      'Promena odjavljuje ostale uređaje, opoziva tvoje API ključeve i isključuje AI aplikacije.',
    none: 'Prijavljuješ se preko Google-a, pa ovde nema lozinke za promenu.',
    current: {
      label: 'Trenutna lozinka',
      required: 'Unesi trenutnu lozinku',
    },
    next: {
      label: 'Nova lozinka',
      help: 'Najmanje 8 znakova.',
    },
    confirm: {
      label: 'Nova lozinka ponovo',
    },
    action: 'Promeni lozinku',
    notify: {
      changed: 'Lozinka je promenjena. Ovaj uređaj ostaje prijavljen.',
    },
    failed: 'Promena lozinke nije uspela. Pokušaj ponovo.',
  },
  sessions: {
    title: 'Prijavljeni uređaji',
    description: 'Svi pregledači i ekrani prijavljeni na tvoj nalog.',
    aria: 'Prijavljeni uređaji',
    device: '{{browser}} na sistemu {{os}}',
    unknownDevice: 'Nepoznat uređaj',
    thisDevice: 'Ovaj uređaj',
    signedIn: 'Prijava {{date}}',
    active: 'Aktivnost {{date}}',
    signOut: {
      action: 'Odjavi',
      aria: 'Odjavi {{device}}',
    },
    others: {
      action: 'Odjavi sve ostale',
      confirm: {
        title: 'Odjaviti sve ostale uređaje?',
        body: 'Svi ostali pregledači i ekrani se odjavljuju. Ovaj ostaje.',
        action: 'Odjavi ostale',
      },
    },
    notify: {
      others: 'Ostali uređaji su odjavljeni.',
    },
    failed: 'Odjava tog uređaja nije uspela. Pokušaj ponovo.',
  },
  screen: {
    title: 'Drugi ekran',
    description:
      'Prijavljuješ se na deljenom računaru ili TV-u? Skeniraj QR kod koji prikazuje ovim telefonom ili unesi njegov kod.',
    action: 'Unesi kod',
  },
  delete: {
    title: 'Brisanje naloga',
    description:
      'Briše nalog sa API ključevima, povezanim nalozima na portalima, izabranim predmetima i povezanim aplikacijama, i ono što su doneli samo tvoji nalozi. Sadržaj predmeta koji drugi vide ostaje.',
    open: 'Obriši nalog…',
    confirm: {
      title: 'Obrisati nalog?',
      body: 'Ovo se ne može poništiti. Sve prijave se završavaju.',
    },
    password: {
      label: 'Tvoja lozinka',
      required: 'Unesi lozinku',
    },
    keep: 'Zadrži nalog',
    action: 'Obriši nalog',
    freshSession:
      'Za brisanje naloga potrebna je prijava u poslednja 24 sata. Vratićeš se pravo ovde.',
    failed: 'Brisanje naloga nije uspelo. Pokušaj ponovo.',
    notify: {
      deleted: 'Tvoj nalog je obrisan.',
    },
  },
} satisfies Messages<typeof en>;
