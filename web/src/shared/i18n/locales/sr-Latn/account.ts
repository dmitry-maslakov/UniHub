import type en from '../en/account';
import type { Messages } from '../../messages';

export default {
  title: 'Nalog',
  screen: {
    title: 'Drugi ekran',
    description:
      'Prijavljuješ se na deljenom računaru ili TV-u? Skeniraj QR kod koji prikazuje ovim telefonom ili unesi njegov kod.',
    action: 'Unesi kod',
  },
  signOut: {
    title: 'Odjava',
    description:
      'Odjavljuje ovaj pregledač. API ključevi rade dok ih ne opozoveš.',
    action: 'Odjavi se',
  },
} satisfies Messages<typeof en>;
