import { useState } from "react";
import { format } from "date-fns";
import { Calendar, Edit, MoreVertical, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BackendMemory } from "@/lib/memoriesApi";

interface MemoryCardProps {
  memory: BackendMemory;
  onEdit?: (memory: BackendMemory) => void;
  onDelete?: (memoryId: string) => void;
}

// Derive a short title from first sentence / up to 60 chars
function deriveTitle(content: string): string {
  const firstSentence = content.split(/(?<=[.!?])\s+/)[0] || content;
  return firstSentence.length > 60 ? firstSentence.slice(0, 57) + "…" : firstSentence;
}

export function MemoryCard({ memory, onEdit, onDelete }: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const title = deriveTitle(memory.content);

  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={`card-memory-${memory.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate" data-testid={`text-title-${memory.id}`}>{title}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(memory.created_at), 'MMM d, yyyy')}</span>
              {typeof memory.similarity === 'number' && (
                <span className="ml-2">Similarity: {(memory.similarity * 100).toFixed(1)}%</span>
              )}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-menu-${memory.id}`}>
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(memory)} data-testid={`button-edit-${memory.id}`}>
                <Edit className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete?.(memory.id)} className="text-destructive" data-testid={`button-delete-${memory.id}`}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <p className={`text-sm text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-3'}`} data-testid={`text-content-${memory.id}`}>
          {memory.content}
        </p>
        {memory.content.length > 180 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-primary hover:underline mt-1"
            data-testid={`button-expand-${memory.id}`}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}