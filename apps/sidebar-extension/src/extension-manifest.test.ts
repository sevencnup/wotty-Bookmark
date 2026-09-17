import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('extension manifest icon assets', () => {
  it('uses the browser-compatible PNG asset for toolbar and extension icons', () => {
    const config = readFileSync(resolve(import.meta.dirname, '..', 'wxt.config.ts'), 'utf8');

    expect(config).toContain("name: 'wotty bookmark sidebar'");
    expect(config).toMatch(/default_icon:\s*\{[\s\S]*16:\s*'logo\.png'[\s\S]*128:\s*'logo\.png'/);
    expect(config).toMatch(/icons:\s*\{[\s\S]*16:\s*'logo\.png'[\s\S]*128:\s*'logo\.png'/);
    expect(config).not.toMatch(/default_icon:[\s\S]*?logo\.webp/);
    expect(config).not.toMatch(/icons:[\s\S]*?logo\.webp/);
  });

  it('enables CORS for development modules loaded by the extension page', () => {
    const config = readFileSync(resolve(import.meta.dirname, '..', 'wxt.config.ts'), 'utf8');

    expect(config).toMatch(/vite:\s*\(\)\s*=>\s*\(\{[\s\S]*?server:\s*\{[\s\S]*?cors:\s*true/);
  });
});
