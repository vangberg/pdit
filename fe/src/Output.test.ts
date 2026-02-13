import { describe, expect, it } from 'vitest';
import { getImageStyle } from './Output';

describe('getImageStyle', () => {
  it('uses responsive max width when width is provided', () => {
    expect(getImageStyle(640)).toEqual({
      width: '100%',
      maxWidth: 640,
    });
  });

  it('preserves aspect ratio when width and height are provided', () => {
    expect(getImageStyle(800, 600)).toEqual({
      width: '100%',
      maxWidth: 800,
      height: 'auto',
      aspectRatio: '800 / 600',
    });
  });

  it('caps height when only height is provided', () => {
    expect(getImageStyle(undefined, 480)).toEqual({
      maxHeight: 480,
    });
  });
});
