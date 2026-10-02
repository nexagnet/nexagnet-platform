import { describe, expect, it } from 'vitest';
import {
  parseCoordinateInput,
  PASTE_EMPTY,
  PASTE_LINK_WITHOUT_POINT,
  PASTE_OUTSIDE_VIETNAM,
  PASTE_SHORT_LINK,
  PASTE_UNREADABLE,
} from '../coordinate-parser';

const HANOI = { latitude: 21.0285, longitude: 105.8542 };

const pointOf = (raw: string) => {
  const parsed = parseCoordinateInput(raw);
  return parsed.ok ? parsed.point : parsed.message;
};

describe('dan toa do (#395)', () => {
  it.each([
    '21.0285, 105.8542',
    '21.0285,105.8542',
    '  21.0285   105.8542 ',
    '21.0285; 105.8542',
    '21,0285 105,8542',
    '21.0285° N, 105.8542° E',
    '105.8542 E, 21.0285 N',
    'geo:21.0285,105.8542?z=17',
  ])('"%s" → Ha Noi', (raw) => {
    expect(pointOf(raw)).toEqual(HANOI);
  });

  it('do/phut/giay kem huong', () => {
    const parsed = parseCoordinateInput('21°01\'42.6"N 105°51\'15.1"E');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.point.latitude).toBeCloseTo(21.0285, 4);
      expect(parsed.point.longitude).toBeCloseTo(105.8542, 4);
    }
  });

  it('huong Nam/Tay la so am', () => {
    expect(pointOf('33.8688 S, 151.2093 E')).toEqual({ latitude: -33.8688, longitude: 151.2093 });
  });
});

describe('dan lien ket ban do', () => {
  it.each([
    [
      'ghim dia diem !3d!4d thang tam ban do @',
      'https://www.google.com/maps/place/Kho/@21.02,105.85,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d21.0285!4d105.8542',
    ],
    ['tam ban do @', 'https://www.google.com/maps/@21.0285,105.8542,15z'],
    ['?q=', 'https://maps.google.com/?q=21.0285,105.8542'],
    ['?q=loc:', 'https://maps.google.com/maps?q=loc:21.0285,105.8542'],
    ['api=1 query', 'https://www.google.com/maps/search/?api=1&query=21.0285%2C105.8542'],
    ['?ll=', 'https://maps.google.com/?ll=21.0285,105.8542&z=16'],
    ['/search/lat,lng', 'https://www.google.com/maps/search/21.0285,+105.8542'],
  ])('%s', (_name, link) => {
    const parsed = parseCoordinateInput(link);
    expect(parsed).toMatchObject({ ok: true, source: 'MAP_LINK', point: HANOI });
  });

  it('lien ket rut gon: noi ro vi sao va lam gi tiep, khong doan', () => {
    expect(parseCoordinateInput('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      ok: false,
      message: PASTE_SHORT_LINK,
    });
  });

  it('lien ket khong co toa do', () => {
    expect(parseCoordinateInput('https://www.google.com/maps/place/Kho+Hai+Phong')).toEqual({
      ok: false,
      message: PASTE_LINK_WITHOUT_POINT,
    });
  });
});

describe('tu choi co ly do — khong doan', () => {
  it('rong, chu, (0,0)', () => {
    expect(parseCoordinateInput('   ')).toEqual({ ok: false, message: PASTE_EMPTY });
    expect(parseCoordinateInput('Kho Hải Phòng')).toEqual({ ok: false, message: PASTE_UNREADABLE });
    expect(parseCoordinateInput('0, 0')).toMatchObject({ ok: false });
  });

  it('hai so bi dao (kinh do truoc) → noi ro, khong tu dao lai', () => {
    const parsed = parseCoordinateInput('105.8542, 21.0285');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain('đảo');
  });

  it('ngoai Viet Nam: van nhan, kem canh bao', () => {
    expect(parseCoordinateInput('48.8584, 2.2945')).toMatchObject({
      ok: true,
      warning: PASTE_OUTSIDE_VIETNAM,
    });
    expect(parseCoordinateInput('21.0285, 105.8542')).toMatchObject({ ok: true, warning: null });
  });
});
