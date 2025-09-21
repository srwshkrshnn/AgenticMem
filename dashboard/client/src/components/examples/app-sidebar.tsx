import { AppSidebar } from "../app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"

export default function AppSidebarExample() {
  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar memoryCount={147} activeIntegrations={8} />
        <div className="flex-1 p-8 bg-background">
          <h2 className="text-lg font-semibold mb-4">Sidebar Preview</h2>
          <p className="text-muted-foreground">
            This demonstrates the sidebar navigation with sample memory and integration counts.
          </p>
        </div>
      </div>
    </SidebarProvider>
  )
}