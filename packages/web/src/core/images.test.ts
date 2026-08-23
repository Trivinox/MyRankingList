import { describe, expect, it } from 'vitest';
import { isAllowedImageUrl } from './images.ts';

const hosted = (path: string) => `https://example.com/${path}`;

describe('isAllowedImageUrl', () => {
  it('takes an https link to an image', () => {
    expect(isAllowedImageUrl(hosted('pizza.jpg'))).toBe(true);
  });

  it('takes every extension on the list', () => {
    for (const extension of ['jpg', 'jpeg', 'png', 'gif', 'webp']) {
      expect(isAllowedImageUrl(hosted(`pizza.${extension}`))).toBe(true);
    }
  });

  it('turns down svg however it is dressed up', () => {
    expect(isAllowedImageUrl(hosted('pizza.svg'))).toBe(false);
    expect(isAllowedImageUrl(hosted('pizza.SVG'))).toBe(false);
    expect(isAllowedImageUrl(hosted('pizza.svgz'))).toBe(false);
  });

  it('turns down extensions that are not images at all', () => {
    expect(isAllowedImageUrl(hosted('pizza.html'))).toBe(false);
    expect(isAllowedImageUrl(hosted('pizza.js'))).toBe(false);
    expect(isAllowedImageUrl(hosted('pizza.pdf'))).toBe(false);
  });

  it('rejects http even when the file is a real image', () => {
    expect(isAllowedImageUrl('http://example.com/pizza.jpg')).toBe(false);
  });

  it('rejects the schemes that are only there to run something', () => {
    expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageUrl('javascript:void("https://example.com/pizza.jpg")')).toBe(false);
    expect(isAllowedImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
    expect(isAllowedImageUrl('file:///home/user/pizza.png')).toBe(false);
    expect(isAllowedImageUrl('ftp://example.com/pizza.png')).toBe(false);
  });

  it('does not care how the scheme was capitalized', () => {
    expect(isAllowedImageUrl('HTTPS://example.com/pizza.jpg')).toBe(true);
    expect(isAllowedImageUrl('HTTP://example.com/pizza.jpg')).toBe(false);
  });

  it('does not care how the extension was capitalized', () => {
    expect(isAllowedImageUrl(hosted('PIZZA.JPG'))).toBe(true);
    expect(isAllowedImageUrl(hosted('pizza.PnG'))).toBe(true);
  });

  it('still sees the extension behind a query string or a fragment', () => {
    expect(isAllowedImageUrl(hosted('pizza.jpg?width=200&v=3'))).toBe(true);
    expect(isAllowedImageUrl(hosted('pizza.png#preview'))).toBe(true);
  });

  it('does not let a query string pass off an extension the path does not have', () => {
    expect(isAllowedImageUrl(hosted('pizza.svg?fake=.jpg'))).toBe(false);
    expect(isAllowedImageUrl(hosted('redirect?to=pizza.png'))).toBe(false);
  });

  it('wants an extension, not just a dot somewhere in the path', () => {
    expect(isAllowedImageUrl(hosted('pizza'))).toBe(false);
    expect(isAllowedImageUrl(hosted(''))).toBe(false);
    expect(isAllowedImageUrl(hosted('v1.2/pizza'))).toBe(false);
    expect(isAllowedImageUrl(hosted('pizza.jpg/thumbnail'))).toBe(false);
  });

  it('reads the last extension when there are two', () => {
    expect(isAllowedImageUrl(hosted('pizza.svg.png'))).toBe(true);
    expect(isAllowedImageUrl(hosted('pizza.png.svg'))).toBe(false);
  });

  it('says no to text that is not a URL', () => {
    expect(isAllowedImageUrl('')).toBe(false);
    expect(isAllowedImageUrl('   ')).toBe(false);
    expect(isAllowedImageUrl('pizza.jpg')).toBe(false);
    expect(isAllowedImageUrl('example.com/pizza.jpg')).toBe(false);
    expect(isAllowedImageUrl('//example.com/pizza.jpg')).toBe(false);
  });

  it('ignores the spaces around a pasted link', () => {
    expect(isAllowedImageUrl('  https://example.com/pizza.jpg  ')).toBe(true);
  });
});
