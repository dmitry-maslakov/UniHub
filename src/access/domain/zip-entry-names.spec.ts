import { zipEntryNames } from './zip-entry-names.js';

describe('zipEntryNames', () => {
  it('puts a file under its folder', () => {
    expect(
      zipEntryNames([
        { path: 'Labs/Week 1', name: 'sheet.pdf' },
        { path: '', name: 'syllabus.pdf' },
      ]),
    ).toEqual(['Labs/Week 1/sheet.pdf', 'syllabus.pdf']);
  });

  it('keeps names a Windows unzip accepts', () => {
    expect(
      zipEntryNames([
        { path: 'Week 1.', name: 'Predavanje 1: Uvod?.pdf' },
        { path: '', name: 'what "is" <this>|*.txt ' },
        { path: '', name: '...' },
      ]),
    ).toEqual([
      'Week 1/Predavanje 1_ Uvod_.pdf',
      'what _is_ _this___.txt',
      'file',
    ]);
  });

  it("puts a member under its archive's name", () => {
    expect(
      zipEntryNames([
        { path: 'Labs', archive: 'lab1.zip', member: 'src/main.c' },
        { path: '', archive: 'x.tar.gz', member: 'a.txt' },
        { path: 'Labs', archive: 'notes', member: 'b.txt' },
      ]),
    ).toEqual(['Labs/lab1/src/main.c', 'x.tar/a.txt', 'Labs/notes/b.txt']);
  });

  it('numbers a name taken twice, ignoring case', () => {
    expect(
      zipEntryNames([
        { path: '', name: 'a.pdf' },
        { path: '', name: 'A.PDF' },
        { path: '', name: 'a.pdf' },
        { path: '', name: 'a (2).pdf' },
        { path: 'x', name: 'a.pdf' },
        { path: '', name: 'README' },
        { path: '', name: 'readme' },
      ]),
    ).toEqual([
      'a.pdf',
      'A (2).PDF',
      'a (3).pdf',
      'a (2) (2).pdf',
      'x/a.pdf',
      'README',
      'readme (2)',
    ]);
  });

  it('numbers a member that lands on a file', () => {
    expect(
      zipEntryNames([
        { path: '', name: 'lab1/a.c' },
        { path: '', archive: 'lab1.zip', member: 'a.c' },
      ]),
    ).toEqual(['lab1/a.c', 'lab1/a (2).c']);
  });

  it('keeps only plain segments, so no entry climbs out or starts at a root', () => {
    expect(
      zipEntryNames([
        { path: '/abs', name: '..\\..\\evil.sh' },
        { path: '', archive: 'a.zip', member: '../../x' },
        { path: '', name: 'C:/boot.ini' },
        { path: '..', name: '..' },
      ]),
    ).toEqual(['abs/evil.sh', 'a/x', 'C_/boot.ini', 'file']);
  });
});
