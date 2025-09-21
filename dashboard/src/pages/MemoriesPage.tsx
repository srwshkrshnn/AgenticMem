import MemorySearch from '../sections/memories/MemorySearch';
import MemoryList from '../sections/memories/MemoryList';
import AddMemoryForm from '../sections/memories/AddMemoryForm';

export default function MemoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Memories</h1>
        <AddMemoryForm />
      </div>
      <MemorySearch />
      <MemoryList />
    </div>
  );
}
