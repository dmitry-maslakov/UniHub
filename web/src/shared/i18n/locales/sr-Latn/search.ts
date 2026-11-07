import type en from '../en/search';
import type { Messages } from '../../messages';

export default {
  title: 'Pretraga',
  description:
    'Pronađi reč u objavama i fajlovima svojih predmeta, i u tekstu unutar slajdova, dokumenata i arhiva.',
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
  },
  error: {
    rateLimited:
      'Polako: dozvoljeno je 20 pretraga u minutu. Sačekaj malo, pa traži ponovo.',
    unavailable:
      'Pretraga trenutno nije dostupna. Pokušaj ponovo malo kasnije.',
    other: 'Pretraga trenutno nije uspela. Pokušaj ponovo.',
  },
  result: {
    download: 'Preuzmi',
    inCourse: 'U predmetu',
    openPost: 'Otvori objavu',
    postIn: 'Objava u predmetu {{course}}',
    inArchive: 'U arhivi {{archive}}',
    page: 'strana {{n}}',
  },
} satisfies Messages<typeof en>;
