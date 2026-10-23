import { describe, expect, it } from 'vitest';
import { deviceName } from './ui/AccountSection.tsx';

describe('deviceName', () => {
  it('names browser and system from a user agent', () => {
    expect(
      deviceName(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome · Android');
    expect(
      deviceName(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iOS');
    expect(
      deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/140.0'),
    ).toBe('Firefox · Windows');
    expect(deviceName('')).toBeNull();
  });
});
