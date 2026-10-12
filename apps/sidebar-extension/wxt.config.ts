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
    // Give the injected floating sidebar a normal page context during development.
    startUrls: ['http://localhost:56992/sidebar-debug.html'],
  },
  vite: () => ({
    server: {
      // The floating extension iframe runs at chrome-extension://<id> and
      // loads development modules from localhost, so CORS must allow it.
      cors: true,
    },
  }),
  manifest: {
    name: 'wotty bookmark sidebar',
    short_name: 'Bookmarks',
    description: 'A private sidebar for your self-hosted bookmark library.',
    version: '0.1.53',
    permissions: ['tabs', 'storage', 'bookmarks', 'scripting'],
    host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [
      {
        resources: ['sidebar-frame.html', 'chunks/*.js', 'assets/*.js', 'assets/*.css', 'logo.png', 'logo.webp'],
        matches: ['http://*/*', 'https://*/*'],
      },
    ],
    action: {
      default_title: '切换悬浮书签侧栏',
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
        description: '切换悬浮书签侧栏',
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
  },
});
