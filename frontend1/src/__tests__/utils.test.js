import { describe, expect, it } from 'vitest';
import {
  calculateSuggestedPayments, fromKobo, isValidGroupName, isValidPersonName, MAX_KOBO,
  normaliseName, paymentMemberName, sanitizeMoneyInput, toKobo,
} from '../utils.js';
import { registrationSchema } from '../validation/authSchemas.js';

describe('person names', () => {
  it.each(['Belema', 'Anne-Marie', "O'Brien", 'Seán O’Brien', 'Ngozi  Okonkwo'])('accepts %s', (name) => {
    expect(isValidPersonName(name)).toBe(true);
  });
  it.each(['', '   ', 'Ada1', '-Ada', 'Ada-', "Ada''Bola", 'Ada - Bola', 'Ada!', 'a'.repeat(81)])('rejects %j', (name) => {
    expect(isValidPersonName(name)).toBe(false);
  });
});

describe('group names', () => {
  it.each(['Weekend getaway', 'Flat 4B', "Mama's & Sons", 'Trip 2026', 'St. Ives'])('accepts %s', (name) => {
    expect(isValidGroupName(name)).toBe(true);
  });
  it.each(['', '  ', '-Trip', '&Co', 'Trip!', 'a'.repeat(71)])('rejects %j', (name) => {
    expect(isValidGroupName(name)).toBe(false);
  });
});

describe('registration uses the same name rule', () => {
  const base = { email: 'a@example.com', password: 'password123', confirmPassword: 'password123' };
  it('accepts a hyphenated name', () => {
    expect(registrationSchema.safeParse({ ...base, name: 'Anne-Marie Obi' }).success).toBe(true);
  });
  it('rejects digits', () => {
    expect(registrationSchema.safeParse({ ...base, name: 'Ada2' }).success).toBe(false);
  });
});

describe('money helpers', () => {
  it('collapses whitespace in names', () => {
    expect(normaliseName('  Ada   Obi ')).toBe('Ada Obi');
  });

  it('keeps only digits and one decimal point with at most 2 decimals', () => {
    expect(sanitizeMoneyInput('₦1,234.567')).toBe('1234.56');
    expect(sanitizeMoneyInput('12.3.4')).toBe('12.34');
    expect(sanitizeMoneyInput('abc')).toBe('');
  });
  it('converts naira to whole kobo without float drift', () => {
    expect(toKobo('0.1')).toBe(10);
    expect(toKobo('19.99')).toBe(1999);
    expect(fromKobo(1999)).toBe(19.99);
  });
  it('keeps the maximum supported kobo amount within safe integer range', () => {
    expect(MAX_KOBO).toBe(10 ** 12);
    expect(Number.isSafeInteger(MAX_KOBO)).toBe(true);
  });
});

describe('suggested payment names', () => {
  const members = [
    { id: 'member-1', name: 'Ada' },
    { id: 'member-2', name: 'Bola' },
  ];

  it('resolves payer and recipient IDs to group member names', () => {
    expect(paymentMemberName({ fromId: 'member-1' }, 'from', members)).toBe('Ada');
    expect(paymentMemberName({ toMemberId: 'member-2' }, 'to', members)).toBe('Bola');
    expect(paymentMemberName({ from_member_id: 'member-1' }, 'from', members)).toBe('Ada');
  });

  it('uses explicit names when supplied by the API', () => {
    expect(paymentMemberName({ fromName: 'Ada Obi', fromId: 'member-1' }, 'from', members)).toBe('Ada Obi');
  });

  it('resolves an ID returned in the from/to field', () => {
    expect(paymentMemberName({ from: 'member-1' }, 'from', members)).toBe('Ada');
  });

  it('calculates who pays whom from member contributions', () => {
    expect(calculateSuggestedPayments(1000, [
      { memberId: 'member-1', amountPaid: 500 },
      { memberId: 'member-2', amountPaid: 300 },
      { memberId: 'member-3', amountPaid: 100 },
      { memberId: 'member-4', amountPaid: 100 },
    ], [
      ...members,
      { id: 'member-3', name: 'Chika' },
      { id: 'member-4', name: 'Dara' },
    ])).toEqual([
      { from: 'Chika', fromId: 'member-3', to: 'Ada', toId: 'member-1', amount: 1.5 },
      { from: 'Dara', fromId: 'member-4', to: 'Ada', toId: 'member-1', amount: 1 },
      { from: 'Dara', fromId: 'member-4', to: 'Bola', toId: 'member-2', amount: 0.5 },
    ]);
  });

  it('returns no transfers when everyone contributed their equal share', () => {
    expect(calculateSuggestedPayments(2000, [
      { memberId: 'member-1', amountPaid: 1000 },
      { memberId: 'member-2', amountPaid: 1000 },
    ], members)).toEqual([]);
  });
});
