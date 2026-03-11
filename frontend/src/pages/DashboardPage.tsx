import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import TestTable from '../components/TestTable'

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getTestStats,
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {/* Stats cards */}
      {isLoading ? (
        <div className="text-gray-500 mb-4">Loading stats...</div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Tests" value={stats.total_tests} />
          <StatCard label="A Wins" value={stats.a_wins} color="green" />
          <StatCard label="B Wins" value={stats.b_wins} color="blue" />
          <StatCard
            label="Avg P-Value"
            value={stats.avg_p_value.toFixed(4)}
          />
        </div>
      ) : null}

      {/* Test table */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold mb-3">A/B Tests</h2>
        <TestTable />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  const colorClass =
    color === 'green'
      ? 'text-green-600'
      : color === 'blue'
        ? 'text-blue-600'
        : 'text-gray-900'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
    </div>
  )
}
