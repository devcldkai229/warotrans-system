import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'

interface TemporaryPasswordDialogProps {
  username: string
  password: string
  onClose: () => void
}

/**
 * The one place the temporary password is shown: the server keeps only its hash and there is no reset yet, so a
 * click beside the card does not close this dialog.
 */
export function TemporaryPasswordDialog({ username, password, onClose }: TemporaryPasswordDialogProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      // The clipboard can be blocked; the password stays selectable on screen.
    }
  }

  return (
    <Modal
      title="Account created"
      subtitle={`Give this temporary password to ${username}. It is shown only once.`}
      closeOnBackdrop={false}
      onClose={onClose}
    >
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 rounded-sm bg-container px-4 py-3">
          <code className="min-w-0 flex-1 font-mono text-base tracking-wide break-all select-all">{password}</code>
          <Button size="sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">The password cannot be shown again after you close this window.</p>
      </div>
      <footer className="flex justify-end px-6 pb-6">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </Modal>
  )
}
