import BackgroundSources from '../sections/sources/BackgroundSources';
import BrowserSources from '../sections/sources/BrowserSources';

export default function SourcesPage() {
  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
      <BackgroundSources />
      <BrowserSources />
    </div>
  );
}
