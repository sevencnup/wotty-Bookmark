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
    disabled: true,
  },
  manifest: {
    name: 'WOTTY BOOKMARK Sidebar',
    short_name: 'Bookmarks',
    description: 'A private sidebar for your self-hosted bookmark library.',
    version: '0.1.14',
    permissions: ['tabs', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: '打开服务器书签库',
      default_icon: {
        16: 'logo.webp',
        32: 'logo.webp',
        48: 'logo.webp',
        128: 'logo.webp',
      },
    },
    icons: {
      16: 'logo.webp',
      32: 'logo.webp',
      48: 'logo.webp',
      128: 'logo.webp',
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
