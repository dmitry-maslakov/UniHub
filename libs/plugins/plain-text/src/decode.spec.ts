import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import iconv from 'iconv-lite';
import { decode } from './decode.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name));

// what the ispit-* fixtures hold, each in another encoding
const latin =
  'Ispit iz predmeta Programski prevodioci održaće se u četvrtak.\n' +
  'Zadatak: napisati funkciju koja računa najveći zajednički delilac; ' +
  'šta se dešava kada je ulaz negativan? Žurite, Đorđe.\n';
const cyrillic =
  'Испит из предмета Програмски преводиоци одржаће се у четвртак.\n' +
  'Задатак: написати функцију која рачуна највећи заједнички делилац; ' +
  'шта се дешава када је улаз негативан? Журите, Ђорђе.\n';

describe('decode', () => {
  it('reads UTF-8, without its BOM', () => {
    expect(decode(Buffer.from(`﻿${latin}`))).toBe(latin);
  });

  it.each([
    ['ispit-cp1251.txt', cyrillic],
    ['ispit-iso-8859-2.txt', latin],
    ['ispit-utf16le.txt', latin],
  ])('finds what %s is in', (name, text) => {
    expect(decode(fixture(name))).toBe(text);
  });

  it('tells windows-1250 from ISO-8859-2, where š and ž differ', () => {
    expect(decode(fixture('nzd-cp1250.c'))).toContain(
      'šta ako su oba negativna? Žao nam je.',
    );
  });

  it('reads the DOS code pages', () => {
    const latin852 = iconv.encode(latin, 'cp852');
    const cyrillic855 = iconv.encode(cyrillic, 'cp855');

    expect(decode(latin852)).toBe(latin);
    expect(decode(cyrillic855)).toBe(cyrillic);
  });

  it('reads UTF-16 by its BOM', () => {
    const bom = iconv.encode(cyrillic, 'utf16be', { addBOM: true });
    expect(decode(bom)).toBe(cyrillic);
  });

  it('finds the code page of a large file by its last line', () => {
    const ascii = 'int x = 0; // ascii only\n'.repeat(20_000);
    const lat = '// komentar: računar, mreža, čvor, šta, Đorđe\n';
    const cyr = '// коментар: рачунар, мрежа, чвор, шта, Ђорђе\n';

    expect(decode(iconv.encode(ascii + lat, 'win1250'))).toBe(ascii + lat);
    expect(decode(iconv.encode(ascii + cyr, 'win1251'))).toBe(ascii + cyr);
  });

  it('takes binary content for no text', () => {
    expect(decode(fixture('noise.png'))).toBeNull();
  });
});
