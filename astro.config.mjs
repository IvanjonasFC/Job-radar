// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// CRM = datos en vivo (lee/escribe la BD `empleo`) → SSR (output server) con adaptador Node.
// CRM con datos en vivo -> SSR con adaptador Node.
export default defineConfig({
  site: 'https://empleo.example.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  server: { port: 3010 },
});
