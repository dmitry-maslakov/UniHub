import type en from '../en/post';
import type { Messages } from '../../messages';

export default {
  head: 'Objava',
  loading: 'Učitava se objava',
  notFound: {
    title: 'Objava nije pronađena',
    description: 'Možda je uklonjena ili ti nije dostupna.',
    back: 'Nazad na predmet',
  },
  locked: {
    title: 'Još ti nije dostupna',
    body: 'Portal još nije otvorio ovu objavu tvom nalogu. Proveri ponovo kasnije.',
  },
  noText: {
    title: 'Ovde nema teksta',
    body: 'Sadržaj ove objave je možda samo na portalu.',
  },
  attachments: {
    title: 'Prilozi',
    aria: 'Prilozi',
  },
  openOn: 'Otvori na portalu {{portal}}',
} satisfies Messages<typeof en>;
