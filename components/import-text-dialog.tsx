'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { FileUp } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

function textToHtml(text: string) {
  const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${escape(line)}</p>` : '<p></p>'))
    .join('')
}

// "Import" here means bringing outside text into the rich editor's content
// — it doesn't save on its own. The user still reviews the result in the
// editor and clicks Save, same as if they'd typed it.
export function ImportTextDialog({ date, onImport }: { date: string; onImport: (html: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function handleFile(file: File) {
    file
      .text()
      .then(setText)
      .catch(() => toast.error('Could not read that file'))
  }

  function apply() {
    if (!text.trim()) {
      toast.error('Nothing to import')
      return
    }
    onImport(textToHtml(text))
    toast.success(`Text loaded into ${date}'s record — review, then Save`)
    setOpen(false)
    setText('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        <FileUp data-icon="inline-start" />
        Import text
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import text into {date}</DialogTitle>
          <DialogDescription>
            Paste text or upload a .txt/.md file. This replaces the editor&apos;s content below — you still need to
            Save.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <input
            type="file"
            accept=".txt,.md,text/plain"
            aria-label="Text file"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="text-sm"
          />
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste text here…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Use this text</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
