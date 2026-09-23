import { describe, expect, it } from 'vitest';
import { NICKNAME_LIMIT, uniqueNickname } from './nicknames.ts';

describe('uniqueNickname', () => {
  it('keeps a free name as typed, apart from the spaces around it', () => {
    expect(uniqueNickname([], 'Juan')).toBe('Juan');
    expect(uniqueNickname(['Ana'], '  Juan Pablo ')).toBe('Juan Pablo');
  });

  it('numbers a repeated name from 2', () => {
    expect(uniqueNickname(['Juan'], 'Juan')).toBe('Juan (2)');
    expect(uniqueNickname(['Juan', 'Juan (2)'], 'Juan')).toBe('Juan (3)');
  });

  it('treats a name that differs only in casing or spaces as the same one', () => {
    expect(uniqueNickname(['Juan'], 'juan ')).toBe('juan (2)');
    expect(uniqueNickname(['Juan', 'juan (2)'], 'JUAN')).toBe('JUAN (3)');
  });

  it('takes the lowest number nobody holds', () => {
    expect(uniqueNickname(['Juan', 'Juan (3)'], 'Juan')).toBe('Juan (2)');
  });

  it('keeps a name that already looks numbered when nobody holds it', () => {
    expect(uniqueNickname(['Juan'], 'Juan (2)')).toBe('Juan (2)');
  });

  it('refuses a blank name', () => {
    expect(uniqueNickname([], '')).toBeNull();
    expect(uniqueNickname([], '   ')).toBeNull();
  });

  it('refuses a name over the limit, but not the suffix that pushes one past it', () => {
    const longest = 'a'.repeat(NICKNAME_LIMIT);

    expect(uniqueNickname([], `${longest}a`)).toBeNull();
    expect(uniqueNickname([longest], longest)).toBe(`${longest} (2)`);
  });
});
