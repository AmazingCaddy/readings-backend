// @ts-check

const config = {
  title: 'Backend Readings',
  tagline: '高并发、高性能、高可靠后端学习手册',

  url: 'https://amazingcaddy.github.io',
  baseUrl: '/readings-backend/',
  organizationName: 'AmazingCaddy',
  projectName: 'readings-backend',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  i18n: {
    defaultLocale: 'zh-CN',
    locales: ['zh-CN'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/AmazingCaddy/readings-backend/tree/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Backend Readings',
        items: [
          { to: '/', label: '学习路径', position: 'left' },
          { to: '/fundamentals/request-lifecycle', label: '请求链路', position: 'left' },
          { to: '/practice/high-concurrency-order-system', label: '实践项目', position: 'left' },
          {
            href: 'https://github.com/AmazingCaddy/readings-backend',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: '核心章节',
            items: [
              { label: '基础机制', to: '/fundamentals/request-lifecycle' },
              { label: '数据库', to: '/database/index-and-slow-query' },
              { label: '缓存', to: '/cache/cache-breakdown' },
            ],
          },
          {
            title: '工程实践',
            items: [
              { label: '消息队列', to: '/messaging/idempotent-consumer' },
              { label: '系统设计', to: '/system-design/order-system' },
              { label: '实践项目', to: '/practice/high-concurrency-order-system' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Backend Readings. Built with Docusaurus.`,
      },
      prism: {
        additionalLanguages: ['java', 'go', 'sql', 'bash', 'json', 'typescript', 'python'],
      },
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },
    }),
};

module.exports = config;
