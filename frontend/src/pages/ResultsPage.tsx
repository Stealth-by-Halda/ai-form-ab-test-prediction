import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import ExperimentCard from '../components/ExperimentCard'
import ConfusionMatrix from '../components/ConfusionMatrix'
import ResultsChart from '../components/ResultsChart'
import type { ExperimentDetail, MethodMetrics, PredictionDetail } from '../types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

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

export default function ResultsPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const { data: experiments, isLoading } = useQuery({
    queryKey: ['experiments'],
    queryFn: api.getExperiments,
  })

  const { data: detail } = useQuery({
    queryKey: ['experiment', id],
    queryFn: () => api.getExperiment(Number(id)),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteExperiment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      if (id) navigate('/results')
    },
  })

  const toggleSelect = (expId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(expId)
      else next.delete(expId)
      return next
    })
  }

  const selectedExperiments = experiments?.filter((e) => selectedIds.has(e.id)) || []

  if (isLoading) return <div className="text-gray-500">Loading experiments...</div>

  if (id && detail) {
    return (
      <ExperimentDetailView
        detail={detail}
        onBack={() => navigate('/results')}
        onDelete={() => deleteMutation.mutate(detail.id)}
      />
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Results</h1>

      {selectedExperiments.length >= 1 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-semibold mb-3">
            Comparing {selectedExperiments.length} Experiment{selectedExperiments.length > 1 ? 's' : ''}
          </h2>
          <ResultsChart experiments={selectedExperiments} />
        </div>
      )}

      {experiments && experiments.length > 0 ? (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <ExperimentCard
              key={exp.id}
              experiment={exp}
              selected={selectedIds.has(exp.id)}
              onSelect={(checked) => toggleSelect(exp.id, checked)}
              onClick={() => navigate(`/results/${exp.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="text-gray-500 text-sm">
          No experiments yet. <a href="/experiment" className="text-blue-600 underline">Run one</a>.
        </div>
      )}
    </div>
  )
}

function getWinner(a: MethodMetrics, b: MethodMetrics): 'a' | 'b' | 'tie' {
  if (a.accuracy == null || b.accuracy == null) return 'tie'
  if (a.accuracy > b.accuracy) return 'a'
  if (b.accuracy > a.accuracy) return 'b'
  if (a.f1 != null && b.f1 != null) {
    if (a.f1 > b.f1) return 'a'
    if (b.f1 > a.f1) return 'b'
  }
  return 'tie'
}

function MetricCards({ label, metrics, isWinner }: { label: string; metrics: MethodMetrics; isWinner: boolean }) {
  const pct = (v: number | null) => (v != null ? (v * 100).toFixed(1) + '%' : '-')
  return (
    <div className={`rounded-lg p-4 ${isWinner ? 'bg-green-50 border-2 border-green-400' : 'bg-white border border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-600">
          {label}: {MODEL_LABELS[metrics.model_type] || metrics.model_type}
        </h3>
        {isWinner && (
          <span className="px-2 py-0.5 rounded bg-green-600 text-white text-xs font-bold">
            WINNER
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Accuracy', value: metrics.accuracy },
          { label: 'Precision', value: metrics.precision },
          { label: 'Recall', value: metrics.recall },
          { label: 'F1 Score', value: metrics.f1 },
        ].map((m) => (
          <div key={m.label} className="bg-white/70 rounded-lg border border-gray-200 p-3">
            <div className="text-xs text-gray-500 uppercase">{m.label}</div>
            <div className="text-xl font-bold mt-0.5">{pct(m.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PredictionsTable({
  label,
  predictions,
}: {
  label: string
  predictions: PredictionDetail[]
}) {
  const showFold = predictions.some((p) => p.fold != null)
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">
        {label} ({predictions.length} predictions)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-3 py-2 text-gray-600">Test ID</th>
              {showFold && <th className="text-left px-3 py-2 text-gray-600">Fold</th>}
              <th className="text-left px-3 py-2 text-gray-600">Predicted</th>
              <th className="text-left px-3 py-2 text-gray-600">Actual</th>
              <th className="text-left px-3 py-2 text-gray-600">Correct</th>
              <th className="text-left px-3 py-2 text-gray-600">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((p, i) => (
              <tr
                key={`${p.ab_test_id}-${p.fold ?? i}`}
                className={`border-b border-gray-100 ${p.correct ? '' : 'bg-red-50'}`}
              >
                <td className="px-3 py-2 font-mono text-xs">{p.ab_test_id.slice(0, 16)}...</td>
                {showFold && <td className="px-3 py-2 text-xs">{p.fold}</td>}
                <td className="px-3 py-2">Variant {p.predicted_winner_is_b ? 'B' : 'A'}</td>
                <td className="px-3 py-2">Variant {p.actual_winner_is_b ? 'B' : 'A'}</td>
                <td className="px-3 py-2">
                  {p.correct ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-red-600 font-medium">No</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {p.confidence != null ? p.confidence.toFixed(3) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ExperimentDetailView({
  detail,
  onBack,
  onDelete,
}: {
  detail: ExperimentDetail
  onBack: () => void
  onDelete: () => void
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; Back to results
      </button>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{detail.name}</h1>
        <button
          onClick={onDelete}
          className="text-sm text-red-600 hover:text-red-700 px-3 py-1 border border-red-200 rounded"
        >
          Delete
        </button>
      </div>

      <div className="text-sm text-gray-500 mb-6 flex gap-3 flex-wrap">
        <span>{detail.feature_mode} mode</span>
        <span>{detail.feature_columns.length} features</span>
        <span>Seed: {detail.random_seed ?? 42}</span>
        {detail.eval_mode === 'cross_validation' ? (
          <>
            <span>{detail.cv_folds}-fold CV</span>
            <span>{detail.num_train} total ({detail.cv_folds}-fold CV)</span>
          </>
        ) : (
          <>
            <span>Test split: {Math.round((detail.test_size ?? 0.2) * 100)}%</span>
            <span>Train: {detail.num_train}, Test: {detail.num_test}</span>
          </>
        )}
        {detail.account_effect && detail.account_effect !== 'none' && (
          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-xs">
            {detail.account_effect === 'fixed' ? 'Account FE' : 'Account RE'}
          </span>
        )}
      </div>

      {/* Method A and B metrics side-by-side */}
      {(() => {
        const winner = getWinner(detail.method_a, detail.method_b)
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <MetricCards label="Method A" metrics={detail.method_a} isWinner={winner === 'a'} />
            <MetricCards label="Method B" metrics={detail.method_b} isWinner={winner === 'b'} />
          </div>
        )
      })()}

      {/* LLM prompt display */}
      {(detail.method_a.model_type === 'llm' || detail.method_b.model_type === 'llm') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {[detail.method_a, detail.method_b].map((method, i) => (
            method.model_type === 'llm' && method.config?.prompt_template ? (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Method {i === 0 ? 'A' : 'B'} Prompt ({method.config.provider as string}/{method.config.model as string})
                </h3>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                  {method.config.prompt_template as string}
                </pre>
              </div>
            ) : (
              <div key={i} />
            )
          ))}
        </div>
      )}

      {/* Confusion matrices side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            Method A: {MODEL_LABELS[detail.method_a.model_type] || detail.method_a.model_type}
          </h3>
          <ConfusionMatrix predictions={detail.predictions_a} />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-2">
            Method B: {MODEL_LABELS[detail.method_b.model_type] || detail.method_b.model_type}
          </h3>
          <ConfusionMatrix predictions={detail.predictions_b} />
        </div>
      </div>

      {/* Feature importances side-by-side */}
      {(detail.feature_importances_a || detail.feature_importances_b) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {detail.feature_importances_a && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <FeatureImportanceChart
                title={`Method A: ${MODEL_LABELS[detail.method_a.model_type] || detail.method_a.model_type}`}
                importances={detail.feature_importances_a}
              />
            </div>
          )}
          {detail.feature_importances_b && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <FeatureImportanceChart
                title={`Method B: ${MODEL_LABELS[detail.method_b.model_type] || detail.method_b.model_type}`}
                importances={detail.feature_importances_b}
              />
            </div>
          )}
        </div>
      )}

      {/* Predictions tables side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <PredictionsTable
            label={`Method A: ${MODEL_LABELS[detail.method_a.model_type] || detail.method_a.model_type}`}
            predictions={detail.predictions_a}
          />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <PredictionsTable
            label={`Method B: ${MODEL_LABELS[detail.method_b.model_type] || detail.method_b.model_type}`}
            predictions={detail.predictions_b}
          />
        </div>
      </div>
    </div>
  )
}

function FeatureImportanceChart({
  title,
  importances,
}: {
  title: string
  importances: Record<string, number>
}) {
  const sorted = Object.entries(importances)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)

  const data = sorted.map(([name, value]) => ({
    name: name.length > 25 ? name.slice(0, 25) + '...' : name,
    importance: +(value * 100).toFixed(2),
  }))

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">{title} - Feature Importances</h3>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 100, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
            <Tooltip />
            <Bar dataKey="importance" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
