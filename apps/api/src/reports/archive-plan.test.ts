import { extensionOf, planArchive, safeNamePart } from './archive-plan';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

expectEqual(safeNamePart(' "Метро" ООД / Sofia: 1 '), '_Метро_ ООД _ Sofia_ 1', 'reserved characters replaced');
expectEqual(safeNamePart('..hidden'), 'hidden', 'no leading dots');
expectEqual(safeNamePart('   '), '_', 'never empty');
expectEqual(extensionOf('documents/c/d/1700-scan.JPG'), 'jpg', 'extension from key');
expectEqual(extensionOf('documents/c/d/noext'), 'bin', 'unknown extension');

const files = planArchive(
  [
    {
      id: 'd1',
      partyName: 'Метро',
      number: '0000123',
      issuedOn: '2026-09-28',
      site: 'Main Store',
      captures: [
        { pageNumber: 2, imageKey: 'k/p2.png', sourceKey: 'k/orig.pdf' },
        { pageNumber: 1, imageKey: 'k/p1.png', sourceKey: 'k/orig.pdf' },
        { pageNumber: 3, imageKey: 'k/extra.jpg', sourceKey: null },
      ],
    },
    { id: 'd2', partyName: 'Метро', number: '0000123', issuedOn: '2026-09-28', site: 'Main Store', captures: [{ pageNumber: 1, imageKey: 'k/a.jpeg', sourceKey: null }] },
    { id: 'd3', partyName: 'Протокол', number: 'W-1', issuedOn: '2026-09-29', site: 'Bar', captures: [] },
  ],
  { siteFolders: true },
);
expectEqual(
  files.map((file) => [file.name, file.key]),
  [
    ['Main Store/Метро_0000123_2026-09-28_p1.pdf', 'k/orig.pdf'],
    ['Main Store/Метро_0000123_2026-09-28_p3.jpg', 'k/extra.jpg'],
    ['Main Store/Метро_0000123_2026-09-28.jpeg', 'k/a.jpeg'],
  ],
  'pdf once, photos by page, site folders',
);

const clash = planArchive(
  [
    { id: 'a', partyName: 'X', number: '1', issuedOn: '2026-01-01', site: 'S', captures: [{ pageNumber: 1, imageKey: 'a.png', sourceKey: null }] },
    { id: 'b', partyName: 'x', number: '1', issuedOn: '2026-01-01', site: 'S', captures: [{ pageNumber: 1, imageKey: 'b.PNG', sourceKey: null }] },
  ],
  { siteFolders: false },
);
expectEqual(clash.map((file) => file.name), ['X_1_2026-01-01.png', 'x_1_2026-01-01 (2).png'], 'case-insensitive duplicates numbered');

console.log('archive-plan tests passed');
