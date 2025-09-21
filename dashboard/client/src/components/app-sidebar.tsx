import { Brain, Database, Settings, Plus, Search, Filter } from "lucide-react"
import { Link, useLocation } from "wouter"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// Menu items for navigation
const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: Database,
    description: "View all memories",
  },
  {
    title: "Integrations",
    url: "/integrations",
    icon: Settings,
    description: "Manage app connections",
  },
]

interface AppSidebarProps {
  memoryCount?: number
  activeIntegrations?: number
}

export function AppSidebar({ memoryCount = 0, activeIntegrations = 0 }: AppSidebarProps) {
  const [location] = useLocation()

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-md">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold" data-testid="text-app-title">
              AI Memory
            </h1>
            <p className="text-xs text-muted-foreground">
              Cross-platform memory layer
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    className={location === item.url ? "bg-sidebar-accent" : ""}
                    data-testid={`link-${item.title.toLowerCase().replace(' ', '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-sm">{item.title}</span>
                        {item.title === "Dashboard" && memoryCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {memoryCount} memories
                          </span>
                        )}
                        {item.title === "Integrations" && activeIntegrations > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {activeIntegrations} active
                          </span>
                        )}
                      </div>
                      {item.title === "Dashboard" && memoryCount > 0 && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {memoryCount}
                        </Badge>
                      )}
                      {item.title === "Integrations" && activeIntegrations > 0 && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          {activeIntegrations}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2 space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start" 
                onClick={() => console.log('Quick search triggered')}
                data-testid="button-quick-search"
              >
                <Search className="h-4 w-4 mr-2" />
                Quick Search
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={() => console.log('Advanced filter triggered')}
                data-testid="button-advanced-filter"
              >
                <Filter className="h-4 w-4 mr-2" />
                Advanced Filter
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-4 py-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Total Memories:</span>
              <span className="font-medium" data-testid="text-memory-count">{memoryCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Active Integrations:</span>
              <span className="font-medium" data-testid="text-integration-count">{activeIntegrations}</span>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}