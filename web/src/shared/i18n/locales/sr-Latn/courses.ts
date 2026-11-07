import type en from '../en/courses';
import type { Messages } from '../../messages';

export default {
  list: {
    title: 'Moji predmeti',
    description:
      'Predmeti koje ovde čitaš, isti oni koje tvoje AI aplikacije čitaju za tebe.',
    descriptionEmpty:
      'Još nema šta da se čita. Poveži svoj nalog na portalu ili izaberi predmete sa javnog sajta, i pojaviće se ovde.',
    aria: 'Tvoji predmeti',
    noSource: 'Još nema izvora',
    loading: 'Učitavaju se tvoji predmeti',
    empty: {
      title: 'Još nema predmeta',
      body: 'Poveži nalog na portalu ili izaberi javne predmete u Izvorima, i pojaviće se ovde. Administrator ti može i dodeliti predmet.',
      action: 'Dodaj izvor',
    },
    addSource: {
      title: 'Dodaj izvor',
    },
  },
  course: {
    head: 'Predmet',
    notFound: {
      title: 'Predmet nije pronađen',
      description: 'Možda je uklonjen ili nije tvoj.',
      back: 'Nazad na Moje predmete',
    },
  },
  sources: {
    aria: 'Izvori',
    withYear: '{{name}} ({{year}})',
    via: {
      account: 'preko tvog naloga',
      pick: 'tvoj izbor',
      link: 'dodao administrator',
    },
  },
  posts: {
    title: 'Objave',
    aria: 'Objave',
    loading: 'Učitavaju se objave',
    empty: {
      title: 'Još nema objava',
      body: 'Objave sa portala ovog predmeta pojavljuju se ovde kad ih UniHub pročita.',
    },
    more: 'Prikaži još objava',
    openOn: 'Na portalu {{portal}}',
    openOnAria: 'Otvori {{title}} na portalu {{portal}}',
  },
  files: {
    title: 'Fajlovi',
    loading: 'Učitavaju se fajlovi',
    empty: {
      title: 'Još nema fajlova',
      body: 'Fajlovi sa portala ovog predmeta pojavljuju se ovde kad ih UniHub pročita.',
    },
    more: 'Prikaži još fajlova',
    download: 'Preuzmi',
    downloadAria: 'Preuzmi {{name}}',
  },
} satisfies Messages<typeof en>;
