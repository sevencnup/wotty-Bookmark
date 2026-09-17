import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('extension manifest icon assets', () => {
  it('uses the browser-compatible PNG asset for toolbar and extension icons', () => {
    const config = readFileSync(resolve(import.meta.dirname, '..', 'wxt.config.ts'), 'utf8');

    expect(config).toContain("name: '书签'");
    expect(config).toContain("short_name: '书签'");
    expect(config).not.toContain('wotty bookmark sidebar');
    expect(config).toMatch(/default_icon:\s*\{[\s\S]*16:\s*'logo\.png'[\s\S]*128:\s*'logo\.png'/);
    expect(config).toMatch(/icons:\s*\{[\s\S]*16:\s*'logo\.png'[\s\S]*128:\s*'logo\.png'/);
    expect(config).not.toMatch(/default_icon:[\s\S]*?logo\.webp/);
    expect(config).not.toMatch(/icons:[\s\S]*?logo\.webp/);
  });

  it('enables CORS for development modules loaded by the extension page', () => {
    const config = readFileSync(resolve(import.meta.dirname, '..', 'wxt.config.ts'), 'utf8');

    expect(config).toMatch(/vite:\s*\(\)\s*=>\s*\(\{[\s\S]*?server:\s*\{[\s\S]*?cors:\s*true/);
  });

  it("keeps WXT's browser runner enabled for extension debugging", () => {
    const config = readFileSync(resolve(import.meta.dirname, '..', 'wxt.config.ts'), 'utf8');

    expect(config).not.toMatch(/webExt:\s*\{[\s\S]*?disabled:\s*true/);
  });

  it('opens a real debug page and registers the Side Panel shortcut', () => {
    const config = readFileSync(resolve(import.meta.dirname, '..', 'wxt.config.ts'), 'utf8');

    expect(config).toMatch(/webExt:\s*\{[\s\S]*?startUrls:\s*\[\s*'http:\/\/localhost:56992\/sidebar-debug\.html'\s*\]/);
    expect(config).toMatch(/commands:\s*\{[\s\S]*?'open-sidebar-for-debug':[\s\S]*?default:\s*'Ctrl\+Shift\+Y'/);
  });

  it('opens the Side Panel from the registered command user gesture', () => {
    const background = readFileSync(resolve(import.meta.dirname, '..', 'entrypoints', 'background.ts'), 'utf8');

    expect(background).toContain('browser.commands.onCommand.addListener');
    expect(background).toContain("command !== 'open-sidebar-for-debug'");
    expect(background).toContain('browser.sidePanel?.open({ tabId: tab.id })');
  });
});
