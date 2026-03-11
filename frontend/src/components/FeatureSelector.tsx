import { useState } from 'react'
import type { FeatureGroup } from '../types'

export default function FeatureSelector({
  featureGroups,
  selected,
  onChange,
}: {
  featureGroups: FeatureGroup[]
  selected: string[]
  onChange: (cols: string[]) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    demographics: true,
    form_config: true,
    question_structure: false,
    question_text: false,
  })

  const toggleGroup = (category: string) => {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  const selectAll = (cols: string[]) => {
    const newSet = new Set(selected)
    cols.forEach((c) => newSet.add(c))
    onChange([...newSet])
  }

  const deselectAll = (cols: string[]) => {
    const removeSet = new Set(cols)
    onChange(selected.filter((c) => !removeSet.has(c)))
  }

  const toggleCol = (col: string) => {
    if (selected.includes(col)) {
      onChange(selected.filter((c) => c !== col))
    } else {
      onChange([...selected, col])
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Feature Columns ({selected.length} selected)
      </label>
      <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded p-2">
        {featureGroups.map((group) => {
          const allSelected = group.columns.every((c) => selected.includes(c))
          const someSelected = group.columns.some((c) => selected.includes(c))
          return (
            <div key={group.category}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.category)}
                  className="text-xs text-gray-400"
                >
                  {expanded[group.category] ? '\u25BC' : '\u25B6'}
                </button>
                <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected
                    }}
                    onChange={() =>
                      allSelected
                        ? deselectAll(group.columns)
                        : selectAll(group.columns)
                    }
                    className="rounded"
                  />
                  {group.category} ({group.columns.length})
                </label>
              </div>
              {expanded[group.category] && (
                <div className="ml-6 mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                  {group.columns.map((col) => (
                    <label
                      key={col}
                      className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(col)}
                        onChange={() => toggleCol(col)}
                        className="rounded"
                      />
                      <span className="truncate" title={col}>
                        {col}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
