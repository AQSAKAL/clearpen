import type { ComponentType } from 'react';
import { BrandXIcon, GoogleplusIcon, TelegramIcon, WhatsappIcon, WikipediaIcon } from './brand-icons.tsx';

export type WebApp = 'telegram' | 'whatsapp' | 'x' | 'google' | 'wikipedia';

interface App {
  /** The tab the writer picks; its Rust webview is `webapp-<key>`. */
  key: WebApp;
  id: string;
  name: string;
  url: string;
  Icon: ComponentType<{ className?: string }>;
  /** A general browser: it gets an address bar. */
  browser: boolean;
}

export const APPS = [
  {
    key: 'telegram',
    id: 'webapp-telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/a/',
    Icon: TelegramIcon,
    browser: false,
  },
  {
    key: 'whatsapp',
    id: 'webapp-whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    Icon: WhatsappIcon,
    browser: false,
  },
  {
    key: 'x',
    id: 'webapp-x',
    name: 'X',
    url: 'https://x.com/',
    Icon: BrandXIcon,
    browser: false,
  },
  {
    key: 'google',
    id: 'webapp-google',
    name: 'Google',
    url: 'https://www.google.com/',
    Icon: GoogleplusIcon,
    browser: true,
  },
  {
    key: 'wikipedia',
    id: 'webapp-wikipedia',
    name: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Main_Page',
    Icon: WikipediaIcon,
    browser: false,
  },
] as const satisfies readonly App[];
