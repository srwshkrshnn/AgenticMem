import { useState, useEffect } from "react";
import { Plus, LayoutGrid, List } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MemoryCard } from "@/components/memory-card";
import { SearchBar } from "@/components/search-bar";
import { MemoryForm, MemoryFormData } from "@/components/memory-form";
import { BackendMemory, createMemory, deleteMemory, listMemories, searchMemories, updateMemory } from "@/lib/memoriesApi";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [editing, setEditing] = useState<BackendMemory | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [useSearch, setUseSearch] = useState(false);

  // List recent memories
  const listQuery = useQuery<BackendMemory[]>({
    queryKey: ['memories', 'list'],
    queryFn: () => listMemories(100),
    enabled: !useSearch, // disable when in search mode
  });

  // Search memories (semantic)
  const searchQueryResult = useQuery<BackendMemory[]>({
    queryKey: ['memories', 'search', searchQuery],
    queryFn: () => searchMemories(searchQuery, 25),
    enabled: useSearch && !!searchQuery.trim(),
  });

  const createMut = useMutation({
    mutationFn: (data: MemoryFormData) => createMemory({ content: data.content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
    }
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MemoryFormData }) => updateMemory(id, { content: data.content }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] })
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories'] })
  });

  const memories: BackendMemory[] = useSearch
    ? (searchQueryResult.data || [])
    : (listQuery.data || []);

  const loading = useSearch ? searchQueryResult.isLoading : listQuery.isLoading;
  const error = useSearch ? searchQueryResult.error : listQuery.error;

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setUseSearch(!!q.trim());
  };

  const handleAdd = async (data: MemoryFormData) => {
    await createMut.mutateAsync(data);
  };

  const handleEdit = async (data: MemoryFormData) => {
    if (!editing) return;
    await updateMut.mutateAsync({ id: editing.id, data });
    setEditing(undefined);
  };

  const handleDelete = (id: string) => deleteMut.mutate(id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Memory Dashboard</h1>
          <p className="text-muted-foreground">Semantic memory store</p>
        </div>
        <Button onClick={() => setIsAddFormOpen(true)} data-testid="button-add-memory">
          <Plus className="h-4 w-4 mr-2" /> Add Memory
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Memories</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-memories">{memories.length}</div>
            {useSearch && <p className="text-xs text-muted-foreground">Search results</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Mode</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{useSearch ? 'Search' : 'Recent'}</div>
            <p className="text-xs text-muted-foreground">{useSearch ? 'Semantic matches' : 'Latest entries'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Mutations</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{createMut.isPending || updateMut.isPending || deleteMut.isPending ? '…' : 'Idle'}</div>
            <p className="text-xs text-muted-foreground">Server sync state</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <SearchBar onSearch={handleSearch} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Showing {memories.length} {useSearch ? 'results' : 'memories'}</span>
            {useSearch && (
              <Badge variant="outline" className="text-xs">Search</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} data-testid="button-grid-view"><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} data-testid="button-list-view"><List className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Card className="flex items-center justify-center py-12"><CardContent>Loading memories…</CardContent></Card>
        ) : error ? (
          <Card className="flex items-center justify-center py-12"><CardContent className="text-destructive">{(error as Error).message}</CardContent></Card>
        ) : memories.length === 0 ? (
          <Card className="flex items-center justify-center py-12">
            <CardContent className="text-center">
              <div className="text-muted-foreground mb-2">No memories {useSearch ? 'match your query' : 'yet'}</div>
              {!useSearch && (
                <Button variant="outline" onClick={() => setIsAddFormOpen(true)} data-testid="button-add-first-memory">
                  <Plus className="h-4 w-4 mr-2" /> Add your first memory
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {memories.map(m => (
              <MemoryCard key={m.id} memory={m} onEdit={setEditing} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      <MemoryForm open={isAddFormOpen} onOpenChange={setIsAddFormOpen} onSubmit={handleAdd} />
      {editing && (
        <MemoryForm open={!!editing} onOpenChange={(o) => !o && setEditing(undefined)} memory={{ id: editing.id, content: editing.content }} onSubmit={handleEdit} />
      )}
    </div>
  );
}