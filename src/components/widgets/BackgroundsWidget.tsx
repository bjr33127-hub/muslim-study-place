import { ImagePlus, Trash2, Upload } from 'lucide-react'
import type { AppCopy } from '../../lib/i18n'
import { publicPath } from '../../lib/publicPath'
import type { BackgroundAsset } from '../../types/app'

type BackgroundsWidgetProps = {
  copy: AppCopy['backgrounds']
  backgrounds: BackgroundAsset[]
  selectedId: string
  uploadError?: string
  onSelect: (id: string) => void
  onUpload: (files: FileList | null) => void
  onDeleteUpload: (id: string) => void
}

export function BackgroundsWidget({
  copy,
  backgrounds,
  selectedId,
  uploadError,
  onSelect,
  onUpload,
  onDeleteUpload,
}: BackgroundsWidgetProps) {
  const guideBackgroundId = backgrounds.find((background) => background.id !== selectedId)?.id

  return (
    <div className="backgrounds-widget">
      <label className="upload-button">
        <Upload size={16} strokeWidth={1.9} />
        {copy.upload}
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(event) => {
            onUpload(event.target.files)
            event.currentTarget.value = ''
          }}
        />
      </label>
      <div className="background-list">
        {backgrounds.map((background) => (
          <div
            key={background.id}
            className={`background-row${
              selectedId === background.id ? ' is-selected' : ''
            }`}
          >
            <button
              type="button"
              data-guide-background-choice={
                selectedId === background.id ? undefined : background.id
              }
              data-guide-target={
                background.id === guideBackgroundId ? 'background-select' : undefined
              }
              onClick={() => onSelect(background.id)}
            >
              <ImagePlus size={16} strokeWidth={1.8} />
              <span>{background.label}</span>
              <small>
                {background.source === 'upload' ? copy.localBase : background.source}
              </small>
            </button>
            {background.source === 'upload' ? (
              <button
                className="quiet-icon"
                type="button"
                aria-label={copy.delete(background.label)}
                onClick={() => onDeleteUpload(background.id)}
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {uploadError ? <p className="form-error">{uploadError}</p> : null}
      <a className="attribution-link" href={publicPath('ATTRIBUTION.md')} target="_blank">
        {copy.attribution}
      </a>
    </div>
  )
}
