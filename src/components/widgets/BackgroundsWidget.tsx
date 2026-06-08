import { ImagePlus, Trash2, Upload } from 'lucide-react'
import type { BackgroundAsset } from '../../types/app'

type BackgroundsWidgetProps = {
  backgrounds: BackgroundAsset[]
  selectedId: string
  uploadError?: string
  onSelect: (id: string) => void
  onUpload: (files: FileList | null) => void
  onDeleteUpload: (id: string) => void
}

export function BackgroundsWidget({
  backgrounds,
  selectedId,
  uploadError,
  onSelect,
  onUpload,
  onDeleteUpload,
}: BackgroundsWidgetProps) {
  return (
    <div className="backgrounds-widget">
      <label className="upload-button">
        <Upload size={16} strokeWidth={1.9} />
        Upload
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
            <button type="button" onClick={() => onSelect(background.id)}>
              <ImagePlus size={16} strokeWidth={1.8} />
              <span>{background.label}</span>
              <small>
                {background.source === 'upload' ? 'local base' : background.source}
              </small>
            </button>
            {background.source === 'upload' ? (
              <button
                className="quiet-icon"
                type="button"
                aria-label={`Delete ${background.label}`}
                onClick={() => onDeleteUpload(background.id)}
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {uploadError ? <p className="form-error">{uploadError}</p> : null}
      <a className="attribution-link" href="/ATTRIBUTION.md" target="_blank">
        Train attribution
      </a>
    </div>
  )
}
