export default function Pagination({ page, limit, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-slate-500">
        Page {page} / {totalPages} - Total {total}
      </p>
      <div className="flex gap-2">
        <button className="btn border border-slate-200" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Prev
        </button>
        <button className="btn border border-slate-200" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}
