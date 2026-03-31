import { X } from 'lucide-react'

export default function Modal({ open, title, onClose, children, maxWidth = 'max-w-2xl' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/50 p-4 !m-0" onClick={onClose}>
      <div className={`my-8 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${maxWidth}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            aria-label="Tutup modal"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white transition hover:bg-red-700"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
