import { MemoryCard } from "../memory-card"
import { type Memory } from "@shared/schema"

// Mock memory data for demonstration
const sampleMemory: Memory = {
  id: "mem-001",
  title: "ChatGPT conversation about React optimization",
  content: "Discussed various React optimization techniques including memoization, code splitting, and lazy loading. Key takeaways: use React.memo for expensive components, implement useMemo for complex calculations, and consider virtualization for large lists. Also explored the benefits of React 18's concurrent features for better user experience.",
  source: "chatgpt",
  tags: ["react", "optimization", "performance", "frontend"],
  metadata: { conversationId: "chat_001", tokens: 1250 },
  createdAt: new Date("2024-01-15T10:30:00Z"),
  updatedAt: new Date("2024-01-15T10:30:00Z"),
}

export default function MemoryCardExample() {
  return (
    <div className="w-full max-w-md">
      <MemoryCard
        memory={sampleMemory}
        onEdit={(memory) => console.log('Edit clicked:', memory.id)}
        onDelete={(id) => console.log('Delete clicked:', id)}
        onView={(memory) => console.log('View clicked:', memory.id)}
      />
    </div>
  )
}