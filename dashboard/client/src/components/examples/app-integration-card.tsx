import { AppIntegrationCard } from "../app-integration-card"
import { type AppIntegration } from "@shared/schema"

// Mock integration data for demonstration
const sampleIntegration: AppIntegration = {
  id: "int-001",
  name: "chatgpt",
  type: "extension",
  enabled: true,
  settings: { syncFrequency: "real-time", includeConversations: true },
  lastSync: new Date("2024-01-15T09:45:00Z"),
}

export default function AppIntegrationCardExample() {
  return (
    <div className="w-full max-w-sm">
      <AppIntegrationCard
        integration={sampleIntegration}
        onToggle={(id, enabled) => console.log('Toggle integration:', id, enabled)}
        onConfigure={(integration) => console.log('Configure integration:', integration.name)}
      />
    </div>
  )
}