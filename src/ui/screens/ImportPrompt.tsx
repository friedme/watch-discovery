import { collectionLabel } from '../../domain/catalogue'
import type { SessionData } from '../../domain/types'

export function ImportPrompt({ session, onAccept, onCancel }: { session: SessionData; onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add shared results">
        <div className="modal-body">
          <h2 className="modal-title">Add shared results?</h2>
          <p>
            {session.name ? `${session.name}'s` : 'These'} results for {collectionLabel(session.collection)} ({session.votes.length} reactions)
            will be saved on this device, so you can view them and compare.
          </p>
          <div className="row-actions">
            <button className="btn primary" onClick={onAccept}>
              Add
            </button>
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
