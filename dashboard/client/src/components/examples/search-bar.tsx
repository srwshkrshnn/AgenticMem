import { SearchBar } from "../search-bar"

export default function SearchBarExample() {
  return (
    <div className="w-full max-w-2xl">
      <SearchBar
        onSearch={(query) => console.log('Search:', query)}
        onFilter={(filters) => console.log('Filter:', filters)}
        placeholder="Search through your AI memories..."
      />
    </div>
  )
}