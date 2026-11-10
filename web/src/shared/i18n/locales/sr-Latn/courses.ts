import type en from '../en/courses';
import type { Messages } from '../../messages';

export default {
  list: {
    title: 'Moji predmeti',
    description:
      'Predmeti koje pratiš. Tvoje AI aplikacije čitaju njih, one koje sakriješ i sve javne izvore.',
    descriptionEmpty:
      'Još nema šta da se čita. Poveži svoj nalog na portalu ili izaberi predmete sa javnog sajta, i pojaviće se ovde.',
    aria: 'Tvoji predmeti',
    noSource: 'Još nema izvora',
    allHidden: 'Svi tvoji predmeti su sakriveni. Prikaži neki sa liste ispod.',
    loading: 'Učitavaju se tvoji predmeti',
    empty: {
      title: 'Još nema predmeta',
      body: 'Poveži nalog na portalu ili izaberi javne predmete u Izvorima, i pojaviće se ovde. Administrator ti može i dodeliti predmet.',
      action: 'Dodaj izvor',
    },
    addSource: {
      title: 'Dodaj izvor',
    },
    firstSync: {
      title: 'Prvi put čitamo tvoj {{label}}',
      body: 'Tvoji predmeti će se pojaviti ovde za nekoliko minuta. Možeš da ostaviš ovu stranicu otvorenu.',
    },
  },
  hidden: {
    title: 'Sakriveni',
    description:
      'Predmeti koje ne držiš na listi iznad. I dalje ih čitaš, pretraga može da gleda u njih, a tvoje AI aplikacije ih čitaju kao i pre.',
    aria: 'Sakriveni predmeti',
  },
  hide: {
    action: 'Sakrij',
    aria: 'Sakrij {{name}} iz Mojih predmeta',
    show: 'Prikaži',
    showLong: 'Prikaži u Mojim predmetima',
    showAria: 'Prikaži {{name}} u Mojim predmetima',
    note: 'Nije u Mojim predmetima.',
    failed: 'Sakrivanje predmeta nije uspelo. Pokušaj ponovo.',
    showFailed: 'Prikazivanje predmeta nije uspelo. Pokušaj ponovo.',
  },
  course: {
    head: 'Predmet',
    notFound: {
      title: 'Predmet nije pronađen',
      description: 'Možda je uklonjen ili nije tvoj.',
      back: 'Nazad na Moje predmete',
    },
    processing: {
      text_one: 'Još se obrađuje: spremno {{done}} od {{count}} fajla',
      text_few: 'Još se obrađuje: spremno {{done}} od {{count}} fajla',
      text_other: 'Još se obrađuje: spremno {{done}} od {{count}} fajlova',
      pictures_one:
        'Tekst je spreman; slike se obrađuju u pozadini: gotovo {{done}} od {{count}} fajla',
      pictures_few:
        'Tekst je spreman; slike se obrađuju u pozadini: gotovo {{done}} od {{count}} fajla',
      pictures_other:
        'Tekst je spreman; slike se obrađuju u pozadini: gotovo {{done}} od {{count}} fajlova',
    },
    tabs: {
      files: 'Fajlovi',
      filesCount: 'Fajlovi ({{count}})',
      posts: 'Objave',
    },
    search: {
      label: 'Pretraži ovaj predmet',
      placeholder: 'Pretraži njegove fajlove i objave',
    },
  },
  sources: {
    aria: 'Izvori',
    withYear: '{{name}} ({{year}})',
    via: {
      account: 'preko tvog naloga',
      public: 'javni izvor',
      link: 'dodao administrator',
    },
  },
  posts: {
    aria: 'Objave',
    loading: 'Učitavaju se objave',
    empty: {
      title: 'Još nema objava',
      body: 'Objave sa portala ovog predmeta pojavljuju se ovde kad ih UniHub pročita.',
    },
    more: 'Prikaži još objava',
  },
  files: {
    aria: 'Fajlovi po folderima',
    count_one: '{{count}} fajl',
    count_few: '{{count}} fajla',
    count_other: '{{count}} fajlova',
    capped: 'Prikazano je prvih 2.000. Pretraga nalazi i ostale.',
    folderCount_one: '{{count}} fajl',
    folderCount_few: '{{count}} fajla',
    folderCount_other: '{{count}} fajlova',
    loading: 'Učitavaju se fajlovi',
    empty: {
      title: 'Još nema fajlova',
      body: 'Fajlovi sa portala ovog predmeta pojavljuju se ovde kad ih UniHub pročita.',
    },
    view: {
      label: 'Prikaz fajlova',
      folders: 'Po folderima',
      newest: 'Najnovije',
    },
    newest: {
      aria: 'Fajlovi, najnoviji prvi',
    },
  },
} satisfies Messages<typeof en>;
