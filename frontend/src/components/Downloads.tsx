import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const REPO = 'AQSAKAL/clearpen';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

type Asset = { name: string; browser_download_url: string; size: number };
type Release = { tag_name: string; name: string; html_url: string; assets: Asset[] };

function platformOf(name: string): 'mac' | 'windows' | 'linux' | null {
  const n = name.toLowerCase();
  if (n.endsWith('.dmg') || n.includes('macos') || n.includes('darwin') || n.includes('mac')) return 'mac';
  if (n.endsWith('.msi') || n.endsWith('.exe')) return 'windows';
  if (n.endsWith('.appimage') || n.endsWith('.deb') || n.endsWith('.rpm') || n.includes('linux')) return 'linux';
  return null;
}

const icons = {
  mac: (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M3 5.5 10.5 4.4v7.1H3zm0 7h7.5v7.1L3 18.5zm8.5-8.3L21 3v8.5h-9.5zm0 9.3H21V21l-9.5-1.3z" />
    </svg>
  ),
  linux: (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M12.5 2c-1.5 0-2.5 1-2.5 2.5 0 .5.1 1 .3 1.4C8.4 6.4 7 8.3 7 10.5c0 1.4.5 2.6 1.3 3.5-.9 1.1-1.3 2.4-1.3 3.8 0 2.9 2.2 5.2 5 5.2s5-2.3 5-5.2c0-1.4-.4-2.7-1.3-3.8.8-.9 1.3-2.1 1.3-3.5 0-2.2-1.4-4.1-3.3-4.6.2-.4.3-.9.3-1.4 0-1.5-1-2.5-2.5-2.5zm-1.5 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
  ),
};

const labels: Record<string, string> = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };

export default function Downloads() {
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => {
        if (!r.ok) throw new Error(`GitHub API ${r.status}`);
        return r.json();
      })
      .then((data: Release) => setRelease(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const groups: Record<string, Asset[]> = { mac: [], windows: [], linux: [] };
  release?.assets.forEach((a) => {
    const p = platformOf(a.name);
    if (p) groups[p].push(a);
  });

  const version = release?.tag_name ?? 'latest';

  return (
    <div>
      <h2 className="font-serif text-3xl font-medium md:text-4xl">Download Clearpen {version}</h2>
      <p className="mt-2 text-muted-foreground">
        {loading
          ? 'Loading latest release from GitHub…'
          : error
          ? 'Could not load release info.'
          : 'Free and open source. Pick your platform.'}
        {error && (
          <a className="ml-2 underline" href={`https://github.com/${REPO}/releases/latest`} target="_blank" rel="noopener">
            View releases on GitHub
          </a>
        )}
      </p>

      {!loading && !error && (
        <Tabs defaultValue="mac" className="mt-8">
          <TabsList>
            {(['mac', 'windows', 'linux'] as const).map((os) => (
              <TabsTrigger key={os} value={os} className="gap-2">
                {icons[os]}
                {labels[os]}
              </TabsTrigger>
            ))}
          </TabsList>
          {(['mac', 'windows', 'linux'] as const).map((os) => (
            <TabsContent key={os} value={os} className="mt-6">
              {groups[os].length === 0 ? (
                <p className="text-sm text-muted-foreground">No {labels[os]} assets in this release.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {groups[os].map((a) => (
                    <Card key={a.name}>
                      <CardContent className="flex items-center justify-between gap-3 p-4">
                        <span className="flex items-center gap-2 truncate text-sm">
                          {icons[os]}
                          {a.name}
                        </span>
                        <Button asChild size="sm" className="shrink-0">
                          <a href={a.browser_download_url} download>
                            Download
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Or browse all assets on the{' '}
                <a className="underline" href={release?.html_url} target="_blank" rel="noopener">
                  releases page
                </a>
                .
              </p>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
