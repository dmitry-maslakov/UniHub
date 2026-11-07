import type en from '../en/common';
import type { Messages } from '../../messages';

export default {
  action: {
    tryAgain: 'Pokušaj ponovo',
    showMore: 'Prikaži još',
    cancel: 'Otkaži',
    keep: 'Zadrži',
    close: 'Zatvori',
    save: 'Sačuvaj',
    copy: 'Kopiraj',
    copied: 'Kopirano',
    copyNamed: 'Kopiraj {{label}}',
    copiedNamed: 'Kopirano: {{label}}',
    done: 'Gotovo',
    continue: 'Nastavi',
  },
  state: {
    loading: 'Učitava se',
    notAvailableYet: 'Još nije dostupno',
  },
  error: {
    title: 'Učitavanje nije uspelo',
    offline: 'Izgleda da nisi na mreži. Proveri vezu, pa pokušaj ponovo.',
    rateLimited:
      'Previše zahteva za kratko vreme. Sačekaj minut, pa pokušaj ponovo.',
    unavailable:
      'Ovaj deo UniHub-a trenutno nije dostupan. Pokušaj ponovo malo kasnije.',
    server:
      'Nešto nije u redu na strani UniHub-a. Pokušaj ponovo malo kasnije.',
    other: 'Nešto nije u redu. Pokušaj ponovo.',
  },
  kind: {
    announcement: 'Obaveštenje',
    assignment: 'Zadatak',
    page: 'Stranica',
    module: 'Modul',
    discussion: 'Diskusija',
  },
  pagination: {
    previous: 'Prethodna strana',
    next: 'Sledeća strana',
    page: 'Strana {{n}}',
  },
} satisfies Messages<typeof en>;
