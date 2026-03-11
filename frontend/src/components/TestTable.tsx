import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { TestSummary, TestDetail } from '../types'

export default function TestTable() {
  const { data: tests, isLoading } = useQuery({
    queryKey: ['tests'],
    queryFn: api.getTests,
  })
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<keyof TestSummary>('ab_test_id')
  const [sortAsc, setSortAsc] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) return <div className="text-gray-500">Loading tests...</div>
  if (!tests) return null

  const filtered = tests.filter(
    (t) =>
      t.ab_test_id.toLowerCase().includes(search.toLowerCase()) ||
      t.form_name.toLowerCase().includes(search.toLowerCase()) ||
      t.account_id.toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortCol]
    const bVal = b[sortCol]
    if (typeof aVal === 'number' && typeof bVal === 'number')
      return sortAsc ? aVal - bVal : bVal - aVal
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal))
  })

  const handleSort = (col: keyof TestSummary) => {
    if (sortCol === col) setSortAsc(!sortAsc)
    else {
      setSortCol(col)
      setSortAsc(true)
    }
  }

  const cols: { key: keyof TestSummary; label: string }[] = [
    { key: 'form_name', label: 'Form Name' },
    { key: 'ab_test_id', label: 'Test ID' },
    { key: 'p_value', label: 'P-Value' },
    { key: 'winner_is_b', label: 'Winner' },
  ]

  return (
    <div>
      <input
        type="text"
        placeholder="Search tests..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 px-3 py-2 border border-gray-300 rounded w-full max-w-md text-sm"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="w-8"></th>
              {cols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="text-left px-3 py-2 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                >
                  {col.label}
                  {sortCol === col.key && (sortAsc ? ' \u25B2' : ' \u25BC')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((test) => (
              <TestRow
                key={test.ab_test_id}
                test={test}
                expanded={expandedId === test.ab_test_id}
                onToggle={() =>
                  setExpandedId(expandedId === test.ab_test_id ? null : test.ab_test_id)
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <p className="text-gray-500 text-sm mt-3">No tests found.</p>
      )}
    </div>
  )
}

function TestRow({
  test,
  expanded,
  onToggle,
}: {
  test: TestSummary
  expanded: boolean
  onToggle: () => void
}) {
  const { data: detail } = useQuery({
    queryKey: ['test', test.ab_test_id],
    queryFn: () => api.getTest(test.ab_test_id),
    enabled: expanded,
  })

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
      >
        <td className="px-2 py-2 text-gray-400">{expanded ? '\u25BC' : '\u25B6'}</td>
        <td className="px-3 py-2">{test.form_name}</td>
        <td className="px-3 py-2 font-mono text-xs text-gray-500">
          {test.ab_test_id.slice(0, 12)}...
        </td>
        <td className="px-3 py-2">{test.p_value.toExponential(2)}</td>
        <td className="px-3 py-2">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
              test.winner_is_b
                ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
            }`}
          >
            Variant {test.winner_is_b ? 'B' : 'A'}
          </span>
        </td>
      </tr>
      {expanded && detail && (
        <tr>
          <td colSpan={5} className="px-4 py-3 bg-gray-50">
            <VariantComparison detail={detail} />
          </td>
        </tr>
      )}
    </>
  )
}

function VariantComparison({ detail }: { detail: TestDetail }) {
  const a = detail.variant_a
  const b = detail.variant_b
  const featureKeys = Object.keys(a.features).filter(
    (k) => a.features[k] !== null || b.features[k] !== null
  ).slice(0, 30) // Show first 30 non-null features

  return (
    <div className="grid grid-cols-2 gap-4">
      {[a, b].map((v, i) => (
        <div key={v.variant_id} className="text-sm">
          <div className="font-medium mb-1">
            Variant {i === 0 ? 'A' : 'B'}: {v.variant_name}
            {v.variant_id === detail.winner_variant_id && (
              <span className="ml-2 text-xs text-green-600 font-bold">WINNER</span>
            )}
          </div>
          <div className="text-gray-600 text-xs mb-2">
            Visits: {v.total_visit_count.toLocaleString()} |
            Leads: {v.total_lead_count.toLocaleString()} |
            CVR: {(v.conversion_rate * 100).toFixed(2)}%
          </div>
          <div className="space-y-0.5">
            {featureKeys.map((key) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="text-gray-500 truncate mr-2">{key}</span>
                <span className="font-mono">{v.features[key] ?? '-'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
