import { ThemeToggle } from "../theme-toggle"
import { ThemeProvider } from "../theme-provider"

export default function ThemeToggleExample() {
  return (
    <ThemeProvider>
      <div className="p-8 space-y-4">
        <h3 className="text-lg font-semibold">Theme Toggle</h3>
        <p className="text-muted-foreground">
          Click the button to switch between light and dark themes
        </p>
        <ThemeToggle />
      </div>
    </ThemeProvider>
  )
}