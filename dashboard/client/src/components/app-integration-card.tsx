import { useState } from "react"
import { Settings, Wifi, WifiOff, CheckCircle2, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { format } from "date-fns"
import { type AppIntegration } from "@shared/schema"

// App configuration with icons and colors
const appConfigs: Record<string, { icon: string; color: string; displayName: string; category: string }> = {
  // Microsoft Apps (API)
  outlook: { icon: "📧", color: "bg-blue-500", displayName: "Outlook", category: "Microsoft 365" },
  onedrive: { icon: "☁️", color: "bg-blue-600", displayName: "OneDrive", category: "Microsoft 365" },
  teams: { icon: "👥", color: "bg-purple-600", displayName: "Microsoft Teams", category: "Microsoft 365" },
  sharepoint: { icon: "📊", color: "bg-blue-700", displayName: "SharePoint", category: "Microsoft 365" },
  calendar: { icon: "📅", color: "bg-blue-500", displayName: "Outlook Calendar", category: "Microsoft 365" },
  
  // Google Apps (API)
  gmail: { icon: "✉️", color: "bg-red-500", displayName: "Gmail", category: "Google Workspace" },
  drive: { icon: "💾", color: "bg-green-500", displayName: "Google Drive", category: "Google Workspace" },
  docs: { icon: "📄", color: "bg-blue-500", displayName: "Google Docs", category: "Google Workspace" },
  sheets: { icon: "📊", color: "bg-green-600", displayName: "Google Sheets", category: "Google Workspace" },
  gcalendar: { icon: "📅", color: "bg-red-400", displayName: "Google Calendar", category: "Google Workspace" },
  
  // Browser Extensions
  chatgpt: { icon: "🤖", color: "bg-green-700", displayName: "ChatGPT", category: "AI Tools" },
  claude: { icon: "🧠", color: "bg-orange-500", displayName: "Claude", category: "AI Tools" },
  notion: { icon: "📝", color: "bg-gray-800", displayName: "Notion", category: "Productivity" },
  linear: { icon: "📈", color: "bg-purple-500", displayName: "Linear", category: "Project Management" },
  github: { icon: "🐙", color: "bg-gray-900", displayName: "GitHub", category: "Development" },
  twitter: { icon: "🐦", color: "bg-blue-400", displayName: "Twitter/X", category: "Social" },
  linkedin: { icon: "💼", color: "bg-blue-700", displayName: "LinkedIn", category: "Professional" },
  reddit: { icon: "🔗", color: "bg-orange-600", displayName: "Reddit", category: "Social" },
}

interface AppIntegrationCardProps {
  integration: AppIntegration
  onToggle?: (integrationId: string, enabled: boolean) => void
  onConfigure?: (integration: AppIntegration) => void
}

export function AppIntegrationCard({ integration, onToggle, onConfigure }: AppIntegrationCardProps) {
  const [isEnabled, setIsEnabled] = useState(Boolean(integration.enabled))
  
  const appConfig = appConfigs[integration.name] || {
    icon: "🔗",
    color: "bg-gray-500",
    displayName: integration.name,
    category: "Other"
  }
  
  const handleToggle = (checked: boolean) => {
    console.log(`Toggle ${integration.name} to ${checked}`)
    setIsEnabled(checked)
    onToggle?.(integration.id, checked)
  }
  
  const handleConfigure = () => {
    console.log(`Configure ${integration.name}`)
    onConfigure?.(integration)
  }
  
  const getStatusBadge = () => {
    if (!isEnabled) return { color: "secondary", icon: WifiOff, text: "Disabled" }
    if (integration.lastSync) {
      return { color: "default", icon: CheckCircle2, text: "Connected" }
    }
    return { color: "outline", icon: AlertCircle, text: "Setup Required" }
  }
  
  const status = getStatusBadge()
  const StatusIcon = status.icon

  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={`card-integration-${integration.name}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <Avatar className={`h-10 w-10 ${appConfig.color} text-white flex-shrink-0`}>
              <AvatarFallback className={`${appConfig.color} text-white`}>
                {appConfig.icon}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm leading-tight" data-testid={`text-app-name-${integration.name}`}>
                {appConfig.displayName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {appConfig.category} • {integration.type === 'api' ? 'API Integration' : 'Browser Extension'}
              </p>
            </div>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            data-testid={`switch-enable-${integration.name}`}
          />
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={status.color as any} className="text-xs">
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.text}
            </Badge>
            {integration.lastSync && (
              <span className="text-xs text-muted-foreground">
                Synced {format(new Date(integration.lastSync), 'MMM d')}
              </span>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleConfigure}
            disabled={!isEnabled}
            data-testid={`button-configure-${integration.name}`}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        
        {isEnabled && !integration.lastSync && (
          <div className="mt-3 p-2 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">
              Complete setup to start syncing memories from {appConfig.displayName}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}