import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Backend only requires 'content'. We'll keep a minimal zod schema here.
const formSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

export type MemoryFormData = z.infer<typeof formSchema>;

interface MemoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Backend memory shape snippet; only fields we need for editing
  memory?: { id: string; content: string } | undefined;
  onSubmit?: (data: MemoryFormData) => Promise<void> | void;
}

export function MemoryForm({ open, onOpenChange, memory, onSubmit }: MemoryFormProps) {
  const isEditing = !!memory;

  const form = useForm<MemoryFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { content: memory?.content || "" },
  });

  // Sync external memory prop into form when editing changes
  useEffect(() => {
    if (memory) {
      form.reset({ content: memory.content });
    } else {
      form.reset({ content: "" });
    }
  }, [memory]);

  const handleSubmit = async (data: MemoryFormData) => {
    await onSubmit?.(data);
    onOpenChange(false);
    form.reset({ content: "" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) form.reset({ content: "" }); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-form-title">{isEditing ? "Edit Memory" : "Add Memory"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter memory content..."
                      className="min-h-40 resize-none"
                      data-testid="textarea-content"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} data-testid="button-submit">
                {form.formState.isSubmitting ? (isEditing ? "Updating..." : "Saving...") : (isEditing ? "Update" : "Add")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}