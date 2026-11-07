import type en from '../en/connect';
import type { Messages } from '../../messages';

export default {
  title: 'Poveži AI',
  description:
    'Dozvoli AI aplikaciji da čita tvoje predmete u tvoje ime: samo čitanje, a pristup joj možeš ovde ukinuti kad god hoćeš.',
  address: {
    title: 'Tvoja UniHub adresa za AI aplikacije',
    description:
      'Daj AI aplikaciji tačno ovu adresu. Ona te šalje ovde da se prijaviš i dozvoliš joj pristup.',
    label: 'MCP adresa',
  },
  guides: {
    title: 'Dodaj UniHub u aplikaciju',
    description: 'Izaberi aplikaciju. Svaka traje minut.',
    claude: {
      tab: 'Claude',
      step1:
        'U Claude-u (claude.ai ili aplikacija za računar) otvori Settings, pa Connectors, i dodaj custom connector.',
      step2: 'Nalepi gornju adresu kao URL.',
      step3:
        "U naprednim podešavanjima izaberi „Use Claude's published identity”. „Register automatically” ne radi sa UniHub-om.",
      step4: 'Poveži se, prijavi se na UniHub ako se traži i dozvoli pristup.',
    },
    chatgpt: {
      tab: 'ChatGPT',
      step1:
        'U podešavanjima ChatGPT-a, pod aplikacijama i konektorima, uključi developer mode i napravi konektor.',
      step2: 'Nalepi gornju adresu i ostavi OAuth prijavu koju nudi.',
      step3: 'Prijavi se na UniHub kad zatraži i dozvoli pristup.',
    },
    claudeCode: {
      tab: 'Claude Code',
      step1: 'Pokreni ovo u terminalu:',
      label: 'Komanda',
      step2: 'Zatim u Claude Code-u pokreni /mcp, izaberi unihub i prijavi se.',
    },
    other:
      'Aplikacija koja ne ume sama da se prijavi koristi API ključ (ispod).',
  },
  apps: {
    title: 'Povezane aplikacije',
    description:
      'AI aplikacije kojima je dozvoljeno da čitaju tvoje predmete. Opoziv je isključuje: ne može da obnovi pristup, a ono što već ima ističe u roku od sat vremena.',
    aria: 'Povezane aplikacije',
    loading: 'Učitavaju se povezane aplikacije',
    connected: 'Povezana {{date}}',
    empty: {
      title: 'Nema povezanih aplikacija',
      body: 'Dodaj UniHub u aplikaciju gore, i pojaviće se ovde.',
    },
    revoke: {
      action: 'Opozovi',
      aria: 'Opozovi {{name}}',
      confirm: {
        title: 'Opozvati {{name}}?',
        body: 'Više neće moći da čita tvoje predmete. Da je ponovo koristiš, poveži je iznova.',
        action: 'Opozovi pristup',
      },
      failed: 'Opozivanje aplikacije nije uspelo. Pokušaj ponovo.',
    },
    notify: {
      revoked: 'Aplikacija {{name}} je isključena.',
    },
  },
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
