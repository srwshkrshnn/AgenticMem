import useSourceStore from '../../store/sourceStore';

const MICROSOFT_APPS = [
  'Outlook Email',
  'Outlook Calendar',
  'Teams Chat',
  'OneNote',
  'OneDrive Files',
  'SharePoint',
  'Tasks / Planner',
];

const GOOGLE_APPS = [
  'Gmail',
  'Google Calendar',
  'Google Drive',
  'Google Docs',
  'Google Meet',
  'Google Chat',
  'Google Keep'
];

export default function BackgroundSources() {
  const { backgroundSources, toggleBackground } = useSourceStore();

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Background API Sources</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Data ingested via official APIs with user consent.</p>
      </header>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Microsoft Graph</h3>
          <ul className="space-y-1">
            {MICROSOFT_APPS.map(a => {
              const key = `ms:${a}`;
              const enabled = backgroundSources.includes(key);
              return (
                <li key={a}>
                  <label className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <input type="checkbox" checked={enabled} onChange={() => toggleBackground(key)} />
                    <span className="text-sm">{a}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Google Workspace</h3>
          <ul className="space-y-1">
            {GOOGLE_APPS.map(a => {
              const key = `google:${a}`;
              const enabled = backgroundSources.includes(key);
              return (
                <li key={a}>
                  <label className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <input type="checkbox" checked={enabled} onChange={() => toggleBackground(key)} />
                    <span className="text-sm">{a}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
