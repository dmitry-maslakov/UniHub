import type en from '../en/privacy';
import type { Messages } from '../../messages';

export default {
  title: 'Politika privatnosti',
  updated: 'Poslednja izmena: {{date}}',
  who: {
    title: 'Ko upravlja',
    body: 'UniHub na adresi {{site}} vodi pojedinac, student programer. Pitanja o tvojim podacima šalji na <mail>{{contact}}</mail>.',
  },
  stored: {
    title: 'Šta čuvamo i zašto',
    intro: 'Tvoj nalog, radi prijave i korišćenja UniHub-a:',
    items: {
      email: 'tvoj imejl i ime;',
      password: 'heš lozinke ili veza sa tvojom Google prijavom;',
      sessions:
        'tvoje sesije, sa IP adresom i pregledačem (user agent) sa kojih je svaka napravljena;',
      keys: 'tvoji API ključevi, sačuvani kao heš;',
      consents: 'saglasnosti i tokeni za AI aplikacije koje povežeš.',
    },
    tokens:
      'Tokeni portala koje povežeš šifrovani su u skladištu. Oni se samo upisuju: možeš ih zameniti ili ukloniti, ali ih ništa ne prikazuje nazad.',
    content:
      'Sadržaj predmeta preuzet sa portala za učenje tvojim tokenom ili tokenom operatera: objave, fajlovi, tekst izdvojen iz njih i indeks pretrage izgrađen na njemu. Vidiš samo svoj pogled na njega.',
  },
  google: {
    title: 'Prijava preko Google-a',
    body: 'Prijava preko Google-a čita samo tvoj osnovni profil i imejl (opsezi openid, email i profile). Od Google-a se ne traži ništa drugo, a Google podaci se koriste samo za tvoju prijavu.',
  },
  sharing: {
    title: 'Deljenje',
    intro:
      'Ne prodajemo podatke, ne prikazujemo reklame i ne koristimo analitiku ni trekere trećih strana. Uključene su tri vrste obrađivača:',
    items: {
      mail: 'Resend isporučuje naše imejlove;',
      traffic: 'Cloudflare prenosi saobraćaj;',
      apps: 'AI aplikacije koje izabereš da povežeš dobijaju pristup samo za čitanje onome što i ti možeš da čitaš, i ništa više.',
    },
  },
  keeping: {
    title: 'Čuvanje i brisanje podataka',
    body: 'Kad se nalog obriše, brišu se i njegove sesije, API ključevi, povezani nalozi na portalima i tokeni, kao i saglasnosti i tokeni povezanih aplikacija, a s njima i ono što su povezani nalozi na portalima doneli, a ne vidi ga nijedan drugi nalog. Sadržaj predmeta koji vide i drugi nalozi ostaje dok ga oni vide. Da bi se tvoj nalog obrisao, piši na <mail>{{contact}}</mail>.',
  },
  security: {
    title: 'Bezbednost',
    body: 'UniHub se služi samo preko HTTPS-a. Tokeni portala su šifrovani, a API ključevi se čuvaju kao heš.',
  },
  changes: {
    title: 'Izmene',
    body: 'Ako se ova politika promeni, menja se i ova stranica, a s njom i datum na vrhu.',
  },
} satisfies Messages<typeof en>;
