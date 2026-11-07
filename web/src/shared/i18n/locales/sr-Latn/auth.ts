import type en from '../en/auth';
import type { Messages } from '../../messages';

export default {
  signIn: {
    title: 'Prijavi se na UniHub',
    description:
      'Tvoji predmeti, njihove objave i fajlovi, i AI aplikacije koje ih čitaju za tebe.',
    googleFailed:
      'Prijava preko Google-a nije završena. Pokušaj ponovo ili koristi imejl.',
    orEmail: 'ili imejlom',
    withPhone: 'Prijavi se telefonom',
    email: {
      label: 'Imejl',
      invalid: 'Unesi imejl svog naloga',
    },
    password: {
      label: 'Lozinka',
      required: 'Unesi lozinku',
    },
    forgot: 'Zaboravljena lozinka?',
    action: 'Prijavi se',
    failed: 'Prijava nije uspela. Pokušaj ponovo.',
    newHere: 'Prvi put na UniHub-u?',
    createAccount: 'Napravi nalog',
  },
  confirmFirst: {
    title: 'Prvo potvrdi imejl',
    body: 'Otvori link koji smo poslali na {{email}}. Ako ga nema, možemo da pošaljemo novi.',
    action: 'Pošalji novi link',
  },
  google: {
    action: 'Nastavi preko Google-a',
  },
  phone: {
    title: 'Prijavi se telefonom',
    description:
      'Skeniraj kod telefonom na kom je UniHub već otvoren i tamo odobri ovaj ekran. Lozinka se ovde ne kuca.',
    qrTitle: 'QR kod za odobravanje ove prijave na telefonu',
    orType: 'Nemaš kameru? Na telefonu otvori {{address}} i unesi ovaj kod:',
    waiting: 'Čeka se odobrenje sa telefona. Kod važi {{minutes}} minuta.',
    approved: 'Odobreno. Prijava je u toku…',
    denied: 'Prijava je odbijena na telefonu.',
    expired: 'Ovaj kod je istekao.',
    newCode: 'Novi kod',
    withEmail: 'Prijavi se imejlom',
  },
  signUp: {
    title: 'Napravi nalog',
    description:
      'Jedno mesto za objave i fajlove svih tvojih predmeta, za tebe i tvoje AI aplikacije.',
    name: {
      label: 'Ime',
      required: 'Unesi ime',
    },
    email: {
      label: 'Imejl',
      help: 'Poslaćemo link da ga potvrdiš.',
      invalid: 'Unesi imejl koji možeš odmah da otvoriš',
    },
    password: {
      label: 'Lozinka',
      help: 'Najmanje 8 znakova.',
      tooShort: 'Koristi najmanje 8 znakova',
      tooLong: 'Koristi najviše 128 znakova',
    },
    action: 'Napravi nalog',
    failed: 'Pravljenje naloga nije uspelo. Pokušaj ponovo.',
    signInInstead: 'Prijavi se umesto toga',
    haveAccount: 'Već imaš nalog?',
    signIn: 'Prijavi se',
  },
  checkEmail: {
    title: 'Proveri imejl',
    sent: 'Poslali smo link na <strong>{{email}}</strong>. Otvori ga da potvrdiš adresu, i prijava je gotova.',
    sentNoEmail:
      'Poslali smo link na tvoj imejl. Otvori ga da potvrdiš adresu, i prijava je gotova.',
    spam: 'Ništa ni posle nekoliko minuta? Pogledaj u neželjenu poštu ili zatraži novi link.',
    resend: 'Pošalji novi link',
    resent: 'Novi link je poslat',
    resendFailed: 'Slanje novog linka nije uspelo. Pokušaj ponovo.',
    back: 'Nazad na prijavu',
  },
  reset: {
    title: 'Resetuj lozinku',
    description: 'Poslaćemo ti imejlom link za izbor nove.',
    email: {
      invalid: 'Unesi imejl svog naloga',
    },
    expired: 'Taj link je istekao ili je već iskorišćen. Zatraži novi ispod.',
    action: 'Pošalji link',
    failed: 'Slanje linka nije uspelo. Pokušaj ponovo.',
    sent: 'Ako postoji nalog za <strong>{{email}}</strong>, link za novu lozinku je na putu. Važi sat vremena.',
    back: 'Nazad na prijavu',
  },
  newPassword: {
    title: 'Izaberi novu lozinku',
    description:
      'Sve prijave se završavaju, a tvoji API ključevi prestaju da rade.',
    label: 'Nova lozinka',
    help: 'Najmanje 8 znakova.',
    confirm: 'Nova lozinka ponovo',
    mismatch: 'Lozinke se ne poklapaju',
    action: 'Promeni lozinku',
    failed: 'Promena lozinke nije uspela. Pokušaj ponovo.',
    notify: {
      title: 'Lozinka je promenjena',
      body: 'Prijavi se novom lozinkom.',
    },
  },
  signInAgain: {
    title: 'Prijavi se ponovo da nastaviš',
    action: 'Prijavi se ponovo',
  },
  error: {
    INVALID_EMAIL_OR_PASSWORD:
      'Taj imejl i lozinka ne odgovaraju nijednom nalogu. Proveri oboje i pokušaj ponovo.',
    USER_ALREADY_EXISTS: 'Već postoji nalog s ovim imejlom.',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Već postoji nalog s ovim imejlom.',
    INVALID_TOKEN: 'Ovaj link je istekao ili je već iskorišćen.',
    PASSWORD_TOO_SHORT: 'Koristi najmanje 8 znakova.',
    PASSWORD_TOO_LONG: 'Koristi najviše 128 znakova.',
    INVALID_PASSWORD: 'To nije tvoja trenutna lozinka.',
    tooMany:
      'Previše pokušaja za kratko vreme. Sačekaj minut, pa pokušaj ponovo.',
  },
} satisfies Messages<typeof en>;
