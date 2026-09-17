import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  dev: {
    server: {
      port: 56992,
      strictPort: true,
    },
  },
  webExt: {
    // WXT's Chromium runner otherwise starts at about:blank. This static page
    // is served by the dev server and gives the Side Panel a real tab context.
    startUrls: ['http://localhost:56992/sidebar-debug.html'],
  },
  vite: () => ({
    server: {
      // The Side Panel runs at chrome-extension://<id>. WXT's dev page imports
      // its modules from localhost, so those module responses must allow the
      // extension origin.
      cors: true,
    },
  }),
  manifest: {
    name: 'wotty bookmark sidebar',
    short_name: 'Bookmarks',
    description: 'A private sidebar for your self-hosted bookmark library.',
    version: '0.1.14',
    permissions: ['tabs', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: '打开服务器书签库',
      default_icon: {
        16: 'logo.png',
        32: 'logo.png',
        48: 'logo.png',
        128: 'logo.png',
      },
    },
    commands: {
      'open-sidebar-for-debug': {
        suggested_key: {
          default: 'Ctrl+Shift+Y',
        },
        description: '打开书签侧边栏',
      },
    },
    icons: {
      16: 'logo.png',
      32: 'logo.png',
      48: 'logo.png',
      128: 'logo.png',
    },
    browser_specific_settings: {
      gecko: {
        id: 'bookmark-vault-sidebar@example.com',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
