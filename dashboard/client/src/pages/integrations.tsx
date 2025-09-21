import { useState } from "react"
import { Plus, Settings, Zap, Cloud, Globe, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppIntegrationCard } from "@/components/app-integration-card"
import { type AppIntegration } from "@shared/schema"

// Mock integration data - //todo: remove mock functionality
const mockIntegrations: AppIntegration[] = [
  // Microsoft Apps (API)
  {
    id: "int-001",
    name: "outlook",
    type: "api",
    enabled: true,
    settings: { syncEmails: true, syncCalendar: true },
    lastSync: new Date("2024-01-15T09:45:00Z"),
  },
  {
    id: "int-002",
    name: "teams",
    type: "api",
    enabled: true,
    settings: { syncMessages: true, syncMeetings: true },
    lastSync: new Date("2024-01-15T08:30:00Z"),
  },
  {
    id: "int-003",
    name: "onedrive",
    type: "api",
    enabled: false,
    settings: {},
    lastSync: null,
  },
  
  // Google Apps (API)
  {
    id: "int-004",
    name: "gmail",
    type: "api",
    enabled: true,
    settings: { syncEmails: true, labelsToSync: ["important", "work"] },
    lastSync: new Date("2024-01-15T10:15:00Z"),
  },
  {
    id: "int-005",
    name: "drive",
    type: "api",
    enabled: false,
    settings: {},
    lastSync: null,
  },
  
  // Browser Extensions
  {
    id: "int-006",
    name: "chatgpt",
    type: "extension",
    enabled: true,
    settings: { syncConversations: true, includeCodeBlocks: true },
    lastSync: new Date("2024-01-15T11:00:00Z"),
  },
  {
    id: "int-007",
    name: "notion",
    type: "api",
    enabled: true,
    settings: { syncPages: true, workspaces: ["personal"] },
    lastSync: new Date("2024-01-14T16:20:00Z"),
  },
  {
    id: "int-008",
    name: "github",
    type: "api",
    enabled: false,
    settings: {},
    lastSync: null,
  },
  // Newly added AI tool extensions
  {
    id: "int-009",
    name: "claude",
    type: "extension",
    enabled: false,
    settings: { syncConversations: true },
    lastSync: null,
  },
  {
    id: "int-010",
    name: "copilot",
    type: "extension",
    enabled: false,
    settings: { syncChats: true },
    lastSync: null,
  },
  {
    id: "int-011",
    name: "grok",
    type: "extension",
    enabled: false,
    settings: { syncConversations: true },
    lastSync: null,
  },
]

export default function Integrations() {
  const [integrations, setIntegrations] = useState<AppIntegration[]>(mockIntegrations) //todo: remove mock functionality
  
  const handleToggleIntegration = (integrationId: string, enabled: boolean) => {
    console.log('Toggle integration:', integrationId, enabled)
    setIntegrations(prev => prev.map(integration => 
      integration.id === integrationId 
        ? { ...integration, enabled }
        : integration
    ))
  }
  
  const handleConfigureIntegration = (integration: AppIntegration) => {
    console.log('Configure integration:', integration.name)
    // In real app, this would open a configuration modal or page
  }
  
  const apiIntegrations = integrations.filter(int => int.type === 'api')
  const extensionIntegrations = integrations.filter(int => int.type === 'extension')
  const activeIntegrations = integrations.filter(int => int.enabled)
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            App Integrations
          </h1>
          <p className="text-muted-foreground">
            Connect your favorite apps to build comprehensive memory
          </p>
        </div>
        <Button variant="outline" data-testid="button-add-integration">
          <Plus className="h-4 w-4 mr-2" />
          Add Integration
        </Button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-count">
              {activeIntegrations.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently syncing
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cloud className="h-4 w-4 text-blue-600" />
              API Based
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-api-count">
              {apiIntegrations.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Direct connections
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4 text-purple-600" />
              Extensions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-extension-count">
              {extensionIntegrations.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Browser based
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-600" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">
              {integrations.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Available apps
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Integration Tabs */}
      <div className="flex-1">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="all" data-testid="tab-all">
              All ({integrations.length})
            </TabsTrigger>
            <TabsTrigger value="api" data-testid="tab-api">
              API ({apiIntegrations.length})
            </TabsTrigger>
            <TabsTrigger value="extensions" data-testid="tab-extensions">
              Extensions ({extensionIntegrations.length})
            </TabsTrigger>
            <TabsTrigger value="active" data-testid="tab-active">
              Active ({activeIntegrations.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-0">
            <div className="space-y-6">
              {/* API Integrations Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Cloud className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-semibold">API Integrations</h2>
                  <Badge variant="outline">{apiIntegrations.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {apiIntegrations.map((integration) => (
                    <AppIntegrationCard
                      key={integration.id}
                      integration={integration}
                      onToggle={handleToggleIntegration}
                      onConfigure={handleConfigureIntegration}
                    />
                  ))}
                </div>
              </div>
              
              {/* Extension Integrations Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-5 w-5 text-purple-600" />
                  <h2 className="text-lg font-semibold">Browser Extensions</h2>
                  <Badge variant="outline">{extensionIntegrations.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {extensionIntegrations.map((integration) => (
                    <AppIntegrationCard
                      key={integration.id}
                      integration={integration}
                      onToggle={handleToggleIntegration}
                      onConfigure={handleConfigureIntegration}
                    />
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="api" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {apiIntegrations.map((integration) => (
                <AppIntegrationCard
                  key={integration.id}
                  integration={integration}
                  onToggle={handleToggleIntegration}
                  onConfigure={handleConfigureIntegration}
                />
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="extensions" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {extensionIntegrations.map((integration) => (
                <AppIntegrationCard
                  key={integration.id}
                  integration={integration}
                  onToggle={handleToggleIntegration}
                  onConfigure={handleConfigureIntegration}
                />
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="active" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeIntegrations.map((integration) => (
                <AppIntegrationCard
                  key={integration.id}
                  integration={integration}
                  onToggle={handleToggleIntegration}
                  onConfigure={handleConfigureIntegration}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Setup Instructions Card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Setup Instructions</CardTitle>
          <CardDescription>
            Get the most out of your integrations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
              1
            </div>
            <div>
              <p className="font-medium text-sm">API Integrations</p>
              <p className="text-xs text-muted-foreground">
                Connect directly through secure OAuth. Enable individual apps to start syncing automatically.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
              2
            </div>
            <div>
              <p className="font-medium text-sm">Browser Extensions</p>
              <p className="text-xs text-muted-foreground">
                Install our Chrome extension to capture memories from web apps like ChatGPT, Notion, and more.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}