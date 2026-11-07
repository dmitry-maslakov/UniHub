import type en from '../en/file';
import type { Messages } from '../../messages';

export default {
  head: 'Fajl',
  notFound: {
    title: 'Fajl nije pronađen',
    description: 'Možda je uklonjen ili ti nije dostupan.',
    back: 'Nazad na predmet',
  },
  backToResults: 'Nazad na rezultate pretrage',
  backToArchive: 'Nazad na {{archive}}',
  meta: {
    inArchive: 'U arhivi {{archive}}',
  },
  open: 'Otvori original',
  download: 'Preuzmi',
  text: {
    title: 'Tekst',
    which: 'Koji tekst da se prikaže',
  },
  position: {
    page: 'Strana {{n}} od {{total}}',
    slide: 'Slajd {{n}} od {{total}}',
    section: 'Deo {{n}} od {{total}}',
  },
  at: {
    page: 'Strana {{n}}',
    slide: 'Slajd {{n}}',
    section: 'Deo {{n}}',
  },
  pagination: {
    previous: 'Prethodni deo',
    next: 'Sledeći deo',
    page: 'Deo {{n}}',
  },
  noContent: {
    title: 'Još nije dostupno',
    body: 'UniHub još nema sadržaj ovog fajla ili ti još nije dostupan. Proveri ponovo kasnije.',
  },
  noText: {
    title: 'Ovaj fajl nema tekst',
    body: 'UniHub iz njega nije mogao da pročita tekst. Otvori original da ga vidiš.',
  },
  noPage: {
    title: 'Ovaj deo ne postoji',
    body: 'Fajl se možda u međuvremenu promenio. <first>Idi na prvi deo.</first>',
  },
  emptyPage: {
    title: 'Na ovom delu nema teksta',
    body: 'Možda je u pitanju slika. Otvori original da je vidiš.',
  },
  members: {
    title: 'U ovoj arhivi',
    description: 'Otvori neki da pročitaš njegov tekst.',
    aria: 'Fajlovi u arhivi',
    noText: 'Bez teksta',
    more: 'Prikaži još',
    leftOut: {
      TOO_LARGE: 'Izostavljen: prevelik',
      OVER_BUDGET: 'Izostavljen: arhiva sadrži previše',
      DUPLICATE_PATH: 'Izostavljen: drugi fajl ima istu putanju',
      TOO_DEEP: 'Izostavljen: ugnežđen preduboko',
    },
  },
  type: {
    pdf: 'PDF',
    slides: 'Prezentacija',
    document: 'Dokument',
    spreadsheet: 'Tabela',
    archive: 'Arhiva',
    image: 'Slika',
    text: 'Tekst',
    code: 'Kôd',
    other: 'Fajl',
  },
} satisfies Messages<typeof en>;
