import { useState } from "react"
import { Search, Filter, X, Calendar, Tag } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface SearchFilters {
  source?: string
  dateRange?: string
  tags?: string[]
}

interface SearchBarProps {
  onSearch?: (query: string) => void
  onFilter?: (filters: SearchFilters) => void
  placeholder?: string
}

export function SearchBar({ 
  onSearch, 
  onFilter, 
  placeholder = "Search memories..." 
}: SearchBarProps) {
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<SearchFilters>({})
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  // Available filter options
  const sources = [
    { value: "outlook", label: "Outlook" },
    { value: "chatgpt", label: "ChatGPT" },
    { value: "notion", label: "Notion" },
    { value: "github", label: "GitHub" },
    { value: "gmail", label: "Gmail" },
    { value: "drive", label: "Google Drive" },
    { value: "teams", label: "Microsoft Teams" },
    { value: "linear", label: "Linear" },
  ]
  
  const dateRanges = [
    { value: "today", label: "Today" },
    { value: "week", label: "Past week" },
    { value: "month", label: "Past month" },
    { value: "year", label: "Past year" },
  ]
  
  const handleSearch = (value: string) => {
    console.log('Search:', value)
    setQuery(value)
    onSearch?.(value)
  }
  
  const handleFilterChange = (newFilters: Partial<SearchFilters>) => {
    const updated = { ...filters, ...newFilters }
    console.log('Filter change:', updated)
    setFilters(updated)
    onFilter?.(updated)
  }
  
  const clearFilters = () => {
    console.log('Clear filters')
    setFilters({})
    onFilter?.({})
  }
  
  const clearSearch = () => {
    console.log('Clear search')
    setQuery("")
    onSearch?.("")
  }
  
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={placeholder}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 pr-10"
            data-testid="input-search"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSearch}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="flex-shrink-0"
              data-testid="button-filter"
            >
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Filters</h4>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    data-testid="button-clear-filters"
                  >
                    Clear all
                  </Button>
                )}
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium">Source App</Label>
                  <Select
                    value={filters.source || ""}
                    onValueChange={(value) => handleFilterChange({ source: value || undefined })}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-source">
                      <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All sources</SelectItem>
                      {sources.map((source) => (
                        <SelectItem key={source.value} value={source.value}>
                          {source.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-xs font-medium">Date Range</Label>
                  <Select
                    value={filters.dateRange || ""}
                    onValueChange={(value) => handleFilterChange({ dateRange: value || undefined })}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-date-range">
                      <SelectValue placeholder="All time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All time</SelectItem>
                      {dateRanges.map((range) => (
                        <SelectItem key={range.value} value={range.value}>
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Active filter badges */}
      {(filters.source || filters.dateRange) && (
        <div className="flex items-center gap-1 flex-wrap">
          {filters.source && (
            <Badge variant="secondary" className="text-xs">
              <Tag className="h-3 w-3 mr-1" />
              {sources.find(s => s.value === filters.source)?.label}
              <Button
                variant="ghost"
                size="icon"
                className="h-3 w-3 ml-1 p-0"
                onClick={() => handleFilterChange({ source: undefined })}
              >
                <X className="h-2 w-2" />
              </Button>
            </Badge>
          )}
          {filters.dateRange && (
            <Badge variant="secondary" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              {dateRanges.find(d => d.value === filters.dateRange)?.label}
              <Button
                variant="ghost"
                size="icon"
                className="h-3 w-3 ml-1 p-0"
                onClick={() => handleFilterChange({ dateRange: undefined })}
              >
                <X className="h-2 w-2" />
              </Button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}