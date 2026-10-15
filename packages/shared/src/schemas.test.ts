import { describe, expect, it } from 'vitest';
import {
  jobCreateSchema,
  jobRoomCreateSchema,
  jobRoomUpdateSchema,
  jobUpdateSchema,
  LENGTH_HELP,
  lengthSchema,
  phaseCreateSchema,
  phaseUpdateSchema,
  roomCreateSchema,
  roomUpdateSchema,
  vendorCreateSchema,
  vendorListSchema,
  vendorUpdateSchema,
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
    if (!bad.success) expect(bad.error.issues[0]?.message).toBe(LENGTH_HELP);
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

describe('vendors', () => {
  it('create needs only a name; the rest default to blank', () => {
    expect(vendorCreateSchema.parse({ name: ' Rolland Reash ' })).toEqual({
      name: 'Rolland Reash',
      trade: '',
      phone: '',
      email: '',
      notes: '',
    });
    expect(vendorCreateSchema.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('email is blank or a real address', () => {
    const ok = vendorCreateSchema.parse({ name: 'TJ', email: ' tj@example.com ' });
    expect(ok.email).toBe('tj@example.com');
    const bad = vendorCreateSchema.safeParse({ name: 'TJ', email: 'tj at example' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe('Enter an email like name@example.com');
  });

  it('update is partial; list defaults to live vendors and no search', () => {
    expect(vendorUpdateSchema.parse({ id: ID, phone: '555-0100' })).toEqual({
      id: ID,
      phone: '555-0100',
    });
    expect(vendorListSchema.parse({})).toEqual({ query: '', includeArchived: false });
  });
});

describe('jobs', () => {
  it('create applies defaults, requires phase and name, and rejects a repeated room', () => {
    expect(jobCreateSchema.parse({ phaseId: ID, name: ' Exterior paint ' })).toEqual({
      phaseId: ID,
      vendorId: null,
      name: 'Exterior paint',
      roomIds: [],
      spec: '',
      notes: '',
      status: 'unstarted',
      sortOrder: 0,
    });
    expect(jobCreateSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(jobCreateSchema.safeParse({ phaseId: ID, name: '' }).success).toBe(false);
    const twice = jobCreateSchema.safeParse({ phaseId: ID, name: 'x', roomIds: [ID, ID] });
    expect(twice.success).toBe(false);
  });

  it('update is partial and can set or clear the vendor', () => {
    expect(jobUpdateSchema.parse({ id: ID, spec: 'SW Alabaster, eggshell' })).toEqual({
      id: ID,
      spec: 'SW Alabaster, eggshell',
    });
    expect(jobUpdateSchema.parse({ id: ID, vendorId: ID })).toEqual({ id: ID, vendorId: ID });
    expect(jobUpdateSchema.parse({ id: ID, vendorId: null })).toEqual({ id: ID, vendorId: null });
  });
});

describe('job rooms', () => {
  it('a blank or missing spec means "same as the job" (null)', () => {
    const base = { jobId: ID, roomId: ID };
    expect(jobRoomCreateSchema.parse(base)).toEqual({
      ...base,
      status: 'unstarted',
      spec: null,
      notes: '',
      sortOrder: 0,
    });
    expect(jobRoomCreateSchema.parse({ ...base, spec: '   ' }).spec).toBeNull();
    expect(jobRoomCreateSchema.parse({ ...base, spec: 'Tile, 12x24' }).spec).toBe('Tile, 12x24');
    expect(jobRoomUpdateSchema.parse({ id: ID, spec: '' })).toEqual({ id: ID, spec: null });
  });

  it('rejects an unknown status', () => {
    expect(jobRoomCreateSchema.safeParse({ jobId: ID, roomId: ID, status: 'done' }).success).toBe(
      false,
    );
  });
});
