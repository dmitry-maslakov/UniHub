import type en from '../en/search';
import type { Messages } from '../../messages';

export default {
  title: 'Pretraga',
  description:
    'Pronađi reč u objavama i fajlovima predmeta iz Mojih predmeta, i u tekstu unutar slajdova, dokumenata i arhiva.',
  field: {
    aria: 'Pretraži svoje predmete',
    placeholder: 'Reč, izraz ili ime funkcije',
    tooShort: 'Unesi bar 2 znaka za pretragu',
  },
  action: 'Traži',
  searching: 'Pretraga je u toku',
  results: {
    aria: 'Rezultati',
  },
  empty: {
    title: 'Ništa ne odgovara upitu „{{q}}”',
    body: 'Probaj druge reči ili manje njih.',
    bodyFiltered: 'Probaj druge reči ili pretraži sve.',
    bodyShown:
      'Probaj druge reči, ili pretraži i sakrivene predmete i javne izvore.',
  },
  error: {
    rateLimited:
      'Polako: dozvoljeno je 20 pretraga u minutu. Sačekaj malo, pa traži ponovo.',
    unavailable:
      'Pretraga trenutno nije dostupna. Pokušaj ponovo malo kasnije.',
    other: 'Pretraga trenutno nije uspela. Pokušaj ponovo.',
  },
  result: {
    inArchive: 'U arhivi {{archive}}',
    nameMatch: 'Poklapa se ime',
  },
  type: {
    aria: 'Šta se pretražuje',
    all: 'Sve',
    files: 'Fajlovi',
    posts: 'Objave',
  },
  everything: 'I sakriveni predmeti i javni izvori',
  scope: {
    course: 'U predmetu {{name}}',
    remove: 'Pretraži sve predmete',
  },
} satisfies Messages<typeof en>;
