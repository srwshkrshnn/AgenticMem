import { useState } from "react"
import { MemoryForm } from "../memory-form"
import { Button } from "@/components/ui/button"

export default function MemoryFormExample() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="p-4">
      <Button onClick={() => setIsOpen(true)}>
        Open Memory Form
      </Button>
      <MemoryForm
        open={isOpen}
        onOpenChange={setIsOpen}
        onSubmit={(data) => console.log('Form submitted:', data)}
      />
    </div>
  )
}