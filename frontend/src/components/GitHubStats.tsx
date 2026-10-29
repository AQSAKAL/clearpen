import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const API = 'https://api.github.com/repos/AQSAKAL/clearpen';

type Repo = {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  owner: { login: string; avatar_url: string; html_url: string };
  html_url: string;
};

export default function GitHubStats() {
  const [repo, setRepo] = useState<Repo | null>(null);

  useEffect(() => {
    fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => r.json())
      .then((d: Repo) => setRepo(d))
      .catch(() => {});
  }, []);

  if (!repo) return null;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <img src={repo.owner.avatar_url} alt={repo.owner.login} className="h-10 w-10 rounded-full" />
      <div className="flex flex-wrap gap-3">
        <Card>
          <CardContent className="px-4 py-2 text-sm">
            ⭐ {repo.stargazers_count.toLocaleString()} stars
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-2 text-sm">
            🍴 {repo.forks_count.toLocaleString()} forks
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-2 text-sm">
            🐛 {repo.open_issues_count.toLocaleString()} issues
          </CardContent>
        </Card>
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={repo.html_url} target="_blank" rel="noopener">
          Star on GitHub
        </a>
      </Button>
    </div>
  );
}
