import { Edit3, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AppCopy } from '../../lib/i18n'
import { methodLabel, normalizeRevisionOffsets } from '../../lib/revisions'
import type { RevisionMethod } from '../../types/app'

type RevisionMethodsWidgetProps = {
  copy: AppCopy['revisions']
  methods: RevisionMethod[]
  onSaveMethod: (method: RevisionMethod) => void
  onDeleteMethod: (id: string) => void
}

type MethodDraft = {
  id: string
  name: string
  delays: string[]
  createdAt: number
}

function blankDraft(): MethodDraft {
  return {
    id: '',
    name: '',
    delays: ['', '', ''],
    createdAt: new Date().getTime(),
  }
}

function methodToDraft(method: RevisionMethod): MethodDraft {
  const delays = method.offsetDays.length
    ? method.offsetDays.map(String)
    : []

  return {
    id: method.id,
    name: method.name,
    delays: [...delays, ...Array.from({ length: Math.max(3 - delays.length, 0) }, () => '')],
    createdAt: method.createdAt,
  }
}

export function RevisionMethodsWidget({
  copy,
  methods,
  onSaveMethod,
  onDeleteMethod,
}: RevisionMethodsWidgetProps) {
  const [draft, setDraft] = useState<MethodDraft | null>(null)
  const [error, setError] = useState('')

  const submitMethod = (event: FormEvent) => {
    event.preventDefault()

    if (!draft) {
      return
    }

    const offsetDays = normalizeRevisionOffsets(draft.delays)

    if (!draft.name.trim() || !offsetDays.length) {
      setError(copy.methodValidation)
      return
    }

    const now = new Date().getTime()

    onSaveMethod({
      id: draft.id || `method-${now}`,
      name: draft.name.trim(),
      offsetDays,
      builtIn: false,
      createdAt: draft.createdAt || now,
      updatedAt: now,
    })
    setDraft(null)
    setError('')
  }

  const updateDelay = (index: number, value: string) => {
    if (!draft) {
      return
    }

    setDraft({
      ...draft,
      delays: draft.delays.map((item, itemIndex) =>
        itemIndex === index ? value.replace(/[^0-9]/g, '') : item,
      ),
    })
  }

  const addDelay = () => {
    if (!draft) {
      return
    }

    setDraft({
      ...draft,
      delays: [...draft.delays, ''],
    })
  }

  const removeDelay = (index: number) => {
    if (!draft) {
      return
    }

    setDraft({
      ...draft,
      delays:
        draft.delays.length <= 1
          ? ['', '', '']
          : draft.delays.filter((_, itemIndex) => itemIndex !== index),
    })
  }

  return (
    <div className="revision-methods">
      <div className="revision-methods-header">
        <div>
          <span>{copy.methodsTitle}</span>
          <strong>{methods.length}</strong>
        </div>
        <button
          className="gold-action small"
          type="button"
          onClick={() => {
            setDraft(blankDraft())
            setError('')
          }}
        >
          <Plus size={14} strokeWidth={2} />
          {copy.addMethod}
        </button>
      </div>

      {draft ? (
        <form className="revision-method-form" onSubmit={submitMethod}>
          <div className="revision-method-form-header">
            <strong>{draft.id ? copy.editMethod : copy.addMethod}</strong>
            <button
              className="quiet-icon"
              type="button"
              aria-label={copy.closeModal}
              onClick={() => setDraft(null)}
            >
              <X size={14} strokeWidth={1.9} />
            </button>
          </div>
          <label>
            <span>{copy.methodName}</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <div className="revision-delay-grid" aria-label={copy.delays}>
            {draft.delays.map((value, index) => (
              <div className="revision-delay-row" key={index}>
                <span>{copy.delayPrefix}</span>
                <input
                  aria-label={copy.delayPlaceholder}
                  inputMode="numeric"
                  value={value}
                  placeholder={copy.delayPlaceholder}
                  onChange={(event) => updateDelay(index, event.target.value)}
                />
                <button
                  className="quiet-icon"
                  type="button"
                  aria-label={copy.removeDelay}
                  onClick={() => removeDelay(index)}
                >
                  <X size={13} strokeWidth={1.9} />
                </button>
              </div>
            ))}
          </div>
          <button className="ghost-action" type="button" onClick={addDelay}>
            <Plus size={14} strokeWidth={1.9} />
            {copy.addDelay}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="gold-action" type="submit">
            <Save size={15} strokeWidth={1.9} />
            {copy.saveMethod}
          </button>
        </form>
      ) : null}

      <div className="revision-method-list">
        {methods.map((method) => (
          <article key={method.id} className="revision-method-card">
            <div>
              <strong>{method.name}</strong>
              <span>{methodLabel(method)}</span>
            </div>
            <em>{method.builtIn ? copy.builtIn : copy.custom}</em>
            {!method.builtIn ? (
              <div className="revision-method-actions">
                <button
                  className="quiet-icon"
                  type="button"
                  aria-label={copy.editMethod}
                  onClick={() => {
                    setDraft(methodToDraft(method))
                    setError('')
                  }}
                >
                  <Edit3 size={14} strokeWidth={1.8} />
                </button>
                <button
                  className="quiet-icon"
                  type="button"
                  aria-label={copy.deleteMethod}
                  onClick={() => {
                    if (globalThis.confirm(copy.deleteMethodConfirm(method.name))) {
                      onDeleteMethod(method.id)
                    }
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </div>
            ) : (
              <Sparkles size={15} strokeWidth={1.8} />
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
