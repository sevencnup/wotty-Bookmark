import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Bookmark Vault Sidebar',
    short_name: 'Bookmarks',
    description: 'A focused sidebar for your browser-native bookmarks.',
    version: '0.1.0',
    permissions: ['bookmarks', 'tabs'],
    action: {
      default_title: '打开书签侧边栏',
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
