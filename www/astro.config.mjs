import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://pdit.dev',
  integrations: [
    starlight({
      title: 'pdit',
      description: 'Interactive Python editor with inline execution results',
      social: {
        github: 'https://github.com/vangberg/pdit',
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Guide',
          items: [
            { label: 'Getting Started', slug: '' },
            { label: 'Installation', slug: 'guide/installation' },
            { label: 'Basic Usage', slug: 'guide/basic-usage' },
            { label: 'Keyboard Shortcuts', slug: 'guide/shortcuts' },
            { label: 'Inline Results', slug: 'guide/inline-results' },
            { label: 'DataFrames', slug: 'guide/dataframes' },
            { label: 'Plots & Images', slug: 'guide/plots' },
            { label: 'Export', slug: 'guide/export' },
          ],
        },
        {
          label: 'FAQ',
          items: [
            { label: 'Common Questions', slug: 'faq/common-questions' },
            { label: 'Troubleshooting', slug: 'faq/troubleshooting' },
          ],
        },
        {
          label: 'News',
          items: [
            { label: 'All Posts', slug: 'news' },
          ],
        },
      ],
    }),
  ],
});
