import { describe, expect, it } from 'vitest';
import {
  itemUpdateSchema,
  lengthSchema,
  phaseCreateSchema,
  phaseUpdateSchema,
  roomCreateSchema,
  roomUpdateSchema,
  workItemCreateSchema,
  workItemListSchema,
} from './schemas';

const ID = '11111111-1111-4111-8111-111111111111';

describe('lengthSchema', () => {
  it('parses typed lengths to snapped inches, empty to null', () => {
    expect(lengthSchema.parse(`7' 3 1/2"`)).toBe(87.5);
    expect(lengthSchema.parse('87.5')).toBe(87.5);
    expect(lengthSchema.parse('3/4"')).toBe(0.75);
    expect(lengthSchema.parse(87.53)).toBe(87.5); // snapped to 1/16
    expect(lengthSchema.parse('')).toBeNull();
    expect(lengthSchema.parse('   ')).toBeNull();
    expect(lengthSchema.parse(null)).toBeNull();
  });

  it('reports unparseable or negative lengths as issues', () => {
    const bad = lengthSchema.safeParse('seven feet');
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toMatch(/cannot parse/);
    expect(lengthSchema.safeParse(-1).success).toBe(false);
  });
});

describe('phases', () => {
  it('create applies defaults and trims the name', () => {
    expect(phaseCreateSchema.parse({ name: '  Phase 2 ' })).toEqual({
      name: 'Phase 2',
      status: 'planned',
      startsOn: null,
      endsOn: null,
      notes: '',
      sortOrder: 0,
    });
  });

  it('rejects an impossible date and an unknown status', () => {
    expect(phaseCreateSchema.safeParse({ name: 'x', startsOn: '2026-02-30' }).success).toBe(false);
    expect(phaseCreateSchema.safeParse({ name: 'x', status: 'done' }).success).toBe(false);
    expect(phaseCreateSchema.parse({ name: 'x', startsOn: '2026-02-28' }).startsOn).toBe(
      '2026-02-28',
    );
  });

  it('update is partial: only the fields sent come through', () => {
    expect(phaseUpdateSchema.parse({ id: ID, status: 'active' })).toEqual({
      id: ID,
      status: 'active',
    });
    expect(phaseUpdateSchema.safeParse({ status: 'active' }).success).toBe(false); // no id
    expect(phaseUpdateSchema.safeParse({ id: ID, name: '' }).success).toBe(false);
  });
});

describe('rooms', () => {
  it('create parses lengths and leaves unmeasured ones null', () => {
    expect(roomCreateSchema.parse({ name: 'Kitchen', lengthIn: `14' 6"`, widthIn: '' })).toEqual({
      name: 'Kitchen',
      lengthIn: 174,
      widthIn: null,
      ceilingHeightIn: null,
      notes: '',
      sortOrder: 0,
    });
  });

  it('update keeps an unsent length out and a cleared one as null', () => {
    expect(roomUpdateSchema.parse({ id: ID, widthIn: '' })).toEqual({ id: ID, widthIn: null });
    expect(roomUpdateSchema.parse({ id: ID, name: 'Nook' })).toEqual({ id: ID, name: 'Nook' });
  });
});

describe('items and work items', () => {
  it('item update accepts rename, reorder, retire', () => {
    expect(itemUpdateSchema.parse({ id: ID, retired: true })).toEqual({ id: ID, retired: true });
  });

  it('work item create defaults to a house-wide, unstarted row', () => {
    expect(workItemCreateSchema.parse({ itemId: ID, phaseId: ID })).toEqual({
      itemId: ID,
      roomId: null,
      phaseId: ID,
      status: 'unstarted',
      spec: '',
      notes: '',
      sortOrder: 0,
    });
    expect(workItemCreateSchema.safeParse({ itemId: 'nope', phaseId: ID }).success).toBe(false);
  });

  it('list filters are all optional; roomId null means house-wide only', () => {
    expect(workItemListSchema.parse({})).toEqual({});
    expect(workItemListSchema.parse({ roomId: null })).toEqual({ roomId: null });
  });
});
