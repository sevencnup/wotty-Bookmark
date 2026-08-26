import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  dev: {
    server: {
      port: 3000,
      strictPort: true,
    },
  },
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'WOTTY BOOKMARK Sidebar',
    short_name: 'Bookmarks',
    description: 'A focused sidebar for your browser-native bookmarks.',
    version: '0.1.2',
    permissions: ['bookmarks', 'tabs', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: '打开书签侧边栏',
      default_icon: {
        16: 'logo.png',
        32: 'logo.png',
        48: 'logo.png',
        128: 'logo.png',
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
