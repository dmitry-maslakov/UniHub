import type en from '../en/admin';
import type { Messages } from '../../messages';

export default {
  title: 'Administracija',
  description: 'Korisnici i predmeti ovog UniHub-a.',
  tabs: {
    users: 'Korisnici',
    courses: 'Predmeti',
  },
  users: {
    search: {
      aria: 'Pretraži korisnike',
      placeholder: 'Traži po imejlu ili po imenu kako je napisano',
    },
    count_one: '{{count}} korisnik',
    count_few: '{{count}} korisnika',
    count_other: '{{count}} korisnika',
    aria: 'Korisnici',
    empty: {
      title: 'Nijedan korisnik ne odgovara upitu „{{q}}”',
      body: 'Probaj imejl ili ime kako ga je korisnik napisao.',
      page: {
        title: 'Nema korisnika na ovoj strani',
        action: 'Nazad na prvu stranu',
      },
    },
    badge: {
      admin: 'Administrator',
      banned: 'Blokiran',
      you: 'Ti',
    },
    unconfirmed: 'Imejl nije potvrđen',
    bannedUntil: 'Blokiran do {{date}}',
    joined: 'Nalog od {{date}}',
    actions: {
      aria: 'Radnje za {{name}}',
      makeAdmin: 'Postavi za administratora',
      removeAdmin: 'Ukloni administratora',
      ban: 'Blokiraj…',
      unban: 'Odblokiraj',
    },
    makeAdmin: {
      confirm: {
        title: 'Postaviti korisnika {{name}} za administratora?',
        body: 'Administratori čitaju sve deljene predmete i upravljaju korisnicima i predmetima.',
        action: 'Postavi',
      },
    },
    removeAdmin: {
      confirm: {
        title: 'Ukloniti korisnika {{name}} iz administratora?',
        body: 'Nalog ostaje, a čita samo predmete koji su mu dodeljeni.',
        action: 'Ukloni',
      },
    },
    ban: {
      title: 'Blokirati korisnika {{name}}?',
      body: 'Blokiran korisnik se odjavljuje i ne čita ništa, ni preko ključa ni preko aplikacije, dok se ne odblokira.',
      duration: {
        label: 'Koliko dugo',
        day: 'Jedan dan',
        week: 'Jednu nedelju',
        month: '30 dana',
        forever: 'Dok se ne odblokira',
      },
      reason: {
        label: 'Razlog',
        help: 'Vide ga samo administratori.',
      },
      action: 'Blokiraj',
    },
    notify: {
      madeAdmin: 'Korisnik {{name}} je sada administrator.',
      removedAdmin: 'Korisnik {{name}} više nije administrator.',
      banned: 'Korisnik {{name}} je blokiran.',
      unbanned: 'Korisnik {{name}} je odblokiran.',
    },
    failed: 'To nije prošlo. Pokušaj ponovo.',
  },
  processing: {
    title: 'Obrada',
    description:
      'Šta pozadinski čitači tek treba da urade: tekstovi, slike (modeli) i indeks pretrage.',
    aria: 'Pozadinski redovi',
    queue: 'Red',
    waiting: 'Čeka',
    active: 'Aktivno',
    failed: 'Neuspelo',
  },
  courses: {
    new: {
      title: 'Novi predmet',
      description:
        'Predmet okuplja predmete sa portala pod jednim imenom i adresom.',
      name: {
        label: 'Naziv',
        required: 'Unesi naziv predmeta',
      },
      slug: {
        label: 'Adresa',
        help: 'Mala slova, cifre i crtice.',
        invalid: 'Koristi mala slova, cifre i pojedinačne crtice',
        taken: 'Drugi predmet već ima ovu adresu',
      },
      action: 'Napravi predmet',
    },
    list: {
      title: 'Predmeti',
      aria: 'Predmeti',
      links_one: '{{count}} predmet sa portala',
      links_few: '{{count}} predmeta sa portala',
      links_other: '{{count}} predmeta sa portala',
      readers_one: '{{count}} korisnik s pristupom',
      readers_few: '{{count}} korisnika s pristupom',
      readers_other: '{{count}} korisnika s pristupom',
      empty: {
        title: 'Još nema predmeta',
        body: 'Napravi ga gore, pa poveži predmete sa portala.',
      },
    },
  },
  course: {
    back: 'Svi predmeti',
    notFound: {
      title: 'Predmet nije pronađen',
      description: 'Nijedan predmet nema ovaj id.',
    },
    links: {
      title: 'Predmeti sa portala',
      description:
        'Šta ovaj predmet okuplja. Korisnici s pristupom ovde čitaju predmete deljenih portala; predmet javnog sajta ovde čitaju svi, a među svojim predmetima ga vide oni koji su ga izabrali, a predmet koji se čita preko korisničkih naloga oni čiji ga nalog vidi.',
      aria: 'Povezani predmeti sa portala',
      year: '{{from}}/{{to}}',
      anyYear: 'Sve godine',
      ownAccounts: 'Čita se preko korisničkih naloga',
      empty: {
        title: 'Još ništa nije povezano',
        body: 'Poveži predmet sa portala ispod.',
      },
      unlink: {
        action: 'Raskini vezu',
        aria: 'Raskini vezu sa {{name}}',
        confirm: {
          title: 'Raskinuti vezu sa {{name}}?',
          body: 'Prestaje da se prikazuje u ovom predmetu. Ništa se ne briše.',
          action: 'Raskini vezu',
        },
      },
      form: {
        label: 'Predmet sa portala',
        placeholder: 'Traži po nazivu',
        option: {
          plain: '{{name}} · {{portal}}',
          elsewhere: '{{name}} · {{portal}} (u predmetu {{course}})',
        },
        nothing: 'Nema predmeta sa portala tog naziva',
        year: {
          label: 'Školska godina',
          placeholder: '2026 za 2026/27',
          invalid: 'Unesi godinu od 1901 do 2999, na primer 2026 za 2026/27.',
        },
        action: 'Poveži',
        moves:
          'Predmet sa portala povezan s drugim predmetom premešta se ovde.',
        picks:
          'Predmet javnog sajta povezan ovde svi čitaju ovde, a prikazuje se ovde svima koji su ga izabrali, bez obzira na to uz šta su ga prikazivali.',
      },
      picked: 'Čitaju ga svi, vide oni koji su ga izabrali',
    },
    readers: {
      title: 'Korisnici s pristupom',
      description: 'Korisnici koji čitaju ovaj predmet, pored administratora.',
      empty: {
        title: 'Još niko',
        body: 'Daj pristup korisniku ispod.',
      },
      remove: {
        action: 'Ukloni',
        aria: 'Ukloni pristup korisniku {{name}}',
        confirm: {
          title: 'Ukloniti pristup korisniku {{name}}?',
          body: 'Prestaje da čita ovaj predmet, osim ako ga vidi preko svojih naloga.',
          action: 'Ukloni pristup',
        },
      },
      form: {
        label: 'Korisnik',
        placeholder: 'Traži po imejlu ili imenu',
        nothing: 'Nema korisnika s tim imejlom ili imenom',
        action: 'Daj pristup',
      },
    },
    notify: {
      linked: 'Povezano.',
      unlinked: 'Veza je raskinuta.',
      granted: 'Korisnik {{name}} sada može da čita ovaj predmet.',
      revoked: 'Pristup korisniku {{name}} je uklonjen.',
    },
    failed: 'To nije prošlo. Pokušaj ponovo.',
  },
} satisfies Messages<typeof en>;
