import useSourceStore from '../../store/sourceStore';

const BROWSER_ONLY_APPS = [
  'ChatGPT',
  'Notion',
  'Confluence',
  'Jira',
  'Linear',
  'Slack Web',
  'Reddit',
  'YouTube',
  'Twitter / X',
  'Hacker News'
];

export default function BrowserSources() {
  const { browserSources, toggleBrowser } = useSourceStore();

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Browser Interaction Sources</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Captured via extension (no official API).</p>
      </header>
      <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
        {BROWSER_ONLY_APPS.map(a => {
          const key = `browser:${a}`;
          const enabled = browserSources.includes(key);
          return (
            <li key={a}>
              <label className="flex items-center gap-2 p-2 rounded-md bg-white/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-brand-400 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={() => toggleBrowser(key)} />
                <span className="text-xs font-medium">{a}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
