import type en from '../en/sources';
import type { Messages } from '../../messages';

export default {
  title: 'Izvori',
  description:
    'Odakle UniHub čita tvoje predmete. Poveži svoj nalog, i UniHub čita predmete koje tamo pratiš, onako kako ih ti vidiš; javni sajt se čita ceo, a ti biraš koje njegove predmete da prikažeš u Mojim predmetima.',
  list: {
    aria: 'Izvori',
  },
  loading: 'Učitavaju se tvoji izvori',
  empty: {
    title: 'Još nema izvora',
    body: 'Na ovom UniHub-u još nema podešenih izvora.',
  },
  status: {
    shared:
      'UniHub sada čita {{label}} za sve, pa se tvoj nalog ne koristi. Ako želiš, raskini vezu.',
    linked: 'Povezano.',
    // a Serbian date ends in a period of its own: no second one after it
    linkedUntil: 'Povezano. Token važi do {{date}}',
    linkedTo: 'Povezano sa {{site}}.',
    linkedToUntil: 'Povezano sa {{site}}. Token važi do {{date}}',
    expired:
      'Tvoj token je istekao. Zameni ga da bi UniHub ponovo čitao {{label}}.',
    revoked:
      '{{label}} više ne prihvata tvoj token. Zameni ga da bi UniHub ponovo čitao {{label}}.',
    notLinked: 'Nije povezano.',
    firstSync:
      'Prvi put ga čitamo: tvoji predmeti će se pojaviti za nekoliko minuta.',
  },
  unavailable:
    'Povezivanje sopstvenog naloga ti nije dostupno za {{label}}. Ako ti treba, javi se administratoru.',
  site: {
    label: '{{label}} tvoje škole',
    help: 'Adresa na kojoj otvaraš {{label}}.',
    invalid: 'Unesi adresu na kojoj otvaraš {{label}}, sa https:// na početku',
    tokenHelp:
      '<anchor>Napravi token</anchor> na stranici Settings svog naloga: New access token, sa svrhom i datumom isteka.',
    getTokenAria: 'Napravi token (otvara {{label}} u novoj kartici)',
  },
  token: {
    label: 'Token',
    newLabel: 'Novi token',
    help: 'Pristupni token koji ti je dao {{label}}. Šalje se jednom i više se ne prikazuje.',
    empty: 'Prvo nalepi token',
  },
  link: 'Poveži {{label}}',
  replace: 'Zameni token',
  freshSession:
    'Da povežeš {{label}}, potrebna je prijava u poslednja 24 sata. Vratićeš se pravo ovde.',
  notify: {
    linked:
      'Veza sa {{label}} je uspostavljena. Predmeti se pojavljuju posle sledećeg čitanja.',
    unlinked: 'Veza sa {{label}} je raskinuta.',
  },
  tokenError: {
    badToken: 'To ne liči na token. Token nema razmake ni prelome reda.',
    badSite:
      'Adresa ili token ne izgledaju ispravno. Adresa počinje sa https://, a token nema razmake ni prelome reda.',
    urlNeeded:
      'Da povežeš {{label}}, potrebna je adresa tvoje škole, a ova stranica je još ne prima. Javi se administratoru.',
    refused: '{{label}} ne prihvata taj token. Proveri ga i pokušaj ponovo.',
    notAllowed:
      'Ovaj {{label}} hostuje {{host}}, koji aplikacije pušta samo preko OAuth-a, nikad preko nalepljenog tokena, pa ga UniHub ne može ovako povezati.',
    tooMany:
      'Previše pokušaja za kratko vreme. Sačekaj minut, pa pokušaj ponovo.',
    unreachableSite:
      'Na toj adresi se nije javio {{label}}. Proveri je ili pokušaj kasnije.',
    unreachable: '{{label}} trenutno nije dostupan. Pokušaj kasnije.',
    other: 'Povezivanje naloga nije uspelo. Pokušaj ponovo.',
  },
  unlink: {
    action: 'Raskini vezu',
    aria: 'Raskini vezu: {{label}}',
    confirm: {
      title: 'Raskinuti vezu sa {{label}}?',
      body: 'UniHub zaboravlja tvoj token i prestaje da čita {{label}} u tvoje ime. Predmeti koje je video samo tvoj nalog više se ne prikazuju. Možeš ponovo da ga povežeš kasnije.',
      action: 'Raskini vezu',
    },
    failed: 'Raskidanje veze nije uspelo. Pokušaj ponovo.',
  },
  catalog: {
    picked_one: '{{count}} izabran',
    picked_few: '{{count}} izabrana',
    picked_other: '{{count}} izabranih',
    nonePicked: 'Nijedan nije izabran',
    description:
      'Javni sajt koji svako može da čita. UniHub ga čita celog, kao i tvoje AI aplikacije. Izaberi predmete koje pratiš, i pojaviće se u Mojim predmetima. Prikaži neki uz svoj predmet da ih čitaš na jednom mestu.',
    search: {
      label: 'Pronađi predmet',
      placeholder: 'Deo naziva',
    },
    searching: 'Pretraga je u toku',
    loading: 'Učitavaju se predmeti ({{label}})',
    empty: {
      title: 'Sajt još ne navodi predmete',
      body: 'Pojaviće se ovde kad ih UniHub pročita.',
    },
    noMatch: {
      title: 'Nijedan naziv predmeta ne sadrži „{{q}}”',
      body: 'Probaj deo reči ili manje reči.',
    },
    new: 'Novo',
    open: 'Otvori',
    openAria: 'Otvori {{name}} na sajtu',
  },
  pick: {
    failed: 'Biranje predmeta nije uspelo. Pokušaj ponovo.',
    unpickFailed: 'Poništavanje izbora nije uspelo. Pokušaj ponovo.',
    gone: 'Tog predmeta više nema u katalogu.',
    tooFast:
      'Previše izmena za kratko vreme. Sačekaj minut, pa pokušaj ponovo.',
  },
  showWith: {
    label: 'Prikaži uz',
    alone: 'Zasebno',
    suggested: 'Predloženo',
    yours: 'Tvoji predmeti',
    others: 'Tvoji ostali predmeti',
    sameFiles: '{{name}} ima neke iste fajlove.',
    linked: 'Prikazuje se uz {{name}}, kako ga je povezao administrator.',
    notYours: 'Taj predmet više ne čitaš preko svog naloga.',
    failed: 'Premeštanje predmeta nije uspelo. Pokušaj ponovo.',
  },
} satisfies Messages<typeof en>;
