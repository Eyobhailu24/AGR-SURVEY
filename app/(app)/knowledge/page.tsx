import { redirect } from 'next/navigation'
import { getSessionWithRole } from '@/lib/auth-guard'
import { listDocuments } from '@/lib/queries/knowledge'
import { DocumentsWorkspace } from '@/components/documents-workspace'

// Readable by anyone who can read the research data — knowing which sources
// the assistant can cite matters to every user. Only super_admins can add or
// remove, which the route handlers enforce independently of this page.
export default async function KnowledgePage() {
  const { role, email } = await getSessionWithRole()
  if (!email) redirect('/login')

  const documents = await listDocuments()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Assistant</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold">Reference library</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approved research documents the AI assistant may search and cite. Nothing here is used to answer
          questions about your own measurements — those come from the database directly.
        </p>
      </div>
      <DocumentsWorkspace initialDocuments={documents} canManage={role === 'super_admin'} />
    </div>
  )
}
