import { AiAssistant } from '@/components/ai-assistant'

// Sits inside the (app) route group, so the layout's sign-in + role
// redirects (and middleware's deny-by-default matcher) already gate it —
// no extra auth check needed here. The route handler re-checks the role
// anyway, since a page guard never protects an API.
export default function AssistantPage() {
  return <AiAssistant />
}
