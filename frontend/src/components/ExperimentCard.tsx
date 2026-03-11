import type { ExperimentSummary, MethodMetrics } from '../types'

const MODEL_LABELS: Record<string, string> = {
  logistic_regression: 'Logistic Regression',
  random_forest: 'Random Forest',
  gradient_boosting: 'Gradient Boosting',
  neural_network: 'Neural Network',
  llm: 'LLM',
  ensemble_lr_rf: 'LR + Random Forest',
  ensemble_lr_gb: 'LR + Gradient Boosting',
  ensemble_rf_gb: 'RF + Gradient Boosting',
  ensemble_nn_gb: 'NN + Gradient Boosting',
  ensemble_lr_rf_gb: 'LR + RF + Gradient Boosting',
  ensemble_all: 'All Models',
}

function MetricRow({ label, metrics, isWinner }: { label: string; metrics: MethodMetrics; isWinner: boolean }) {
  const pct = (v: number | null) => (v != null ? (v * 100).toFixed(1) + '%' : '-')
  return (
    <div className="text-xs">
      <span className="text-gray-500 font-medium">{label}</span>{' '}
      <span className="text-gray-400">({MODEL_LABELS[metrics.model_type] || metrics.model_type})</span>
      {isWinner && (
        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold text-[10px]">
          WINNER
        </span>
      )}
      <div className="flex gap-3 mt-0.5">
        <span>Acc <span className="font-semibold">{pct(metrics.accuracy)}</span></span>
        <span>Prec <span className="font-semibold">{pct(metrics.precision)}</span></span>
        <span>Rec <span className="font-semibold">{pct(metrics.recall)}</span></span>
        <span>F1 <span className="font-semibold">{pct(metrics.f1)}</span></span>
      </div>
    </div>
  )
}

function getWinner(a: MethodMetrics, b: MethodMetrics): 'a' | 'b' | 'tie' {
  if (a.accuracy == null || b.accuracy == null) return 'tie'
  if (a.accuracy > b.accuracy) return 'a'
  if (b.accuracy > a.accuracy) return 'b'
  // Tiebreak on F1
  if (a.f1 != null && b.f1 != null) {
    if (a.f1 > b.f1) return 'a'
    if (b.f1 > a.f1) return 'b'
  }
  return 'tie'
}

export default function ExperimentCard({
  experiment,
  selected,
  onSelect,
  onClick,
}: {
  experiment: ExperimentSummary
  selected: boolean
  onSelect: (checked: boolean) => void
  onClick: () => void
}) {
  return (
    <div
      className={`bg-white rounded-lg border p-4 cursor-pointer transition-colors ${
        selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation()
            onSelect(e.target.checked)
          }}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 rounded"
        />
        <div className="flex-1" onClick={onClick}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{experiment.name}</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                experiment.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : experiment.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {experiment.status}
            </span>
            {experiment.account_effect && experiment.account_effect !== 'none' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                {experiment.account_effect === 'fixed' ? 'Account FE' : 'Account RE'}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mb-2">
            {experiment.feature_mode} | {experiment.feature_columns.length} features
          </div>
          {experiment.status === 'completed' && (() => {
            const winner = getWinner(experiment.method_a, experiment.method_b)
            return (
              <div className="space-y-1">
                <MetricRow label="Method A" metrics={experiment.method_a} isWinner={winner === 'a'} />
                <MetricRow label="Method B" metrics={experiment.method_b} isWinner={winner === 'b'} />
              </div>
            )
          })()}
          {experiment.status === 'failed' && experiment.error_message && (
            <div className="text-xs text-red-600 mt-1 truncate">
              {experiment.error_message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
