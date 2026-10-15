import { describe, expect, it } from 'vitest';
import { csvRecords, parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads quoted fields with commas, doubled quotes and line breaks', () => {
    const text = 'a,b,c\r\n1,"two, three","say ""hi"""\n"multi\nline",,x\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, three', 'say "hi"'],
      ['multi\nline', '', 'x'],
    ]);
  });

  it('drops a byte-order mark and a blank last line; refuses an unclosed quote', () => {
    expect(parseCsv('﻿id\nL1\n\n')).toEqual([['id'], ['L1']]);
    expect(() => parseCsv('a\n"open')).toThrow(/missing quote/);
  });

  it('keys rows by the header', () => {
    expect(csvRecords('id,name\nL1,Couch\nL2')).toEqual([
      { id: 'L1', name: 'Couch' },
      { id: 'L2', name: '' },
    ]);
  });
});
