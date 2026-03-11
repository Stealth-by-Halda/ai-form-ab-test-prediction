import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ExperimentSummary } from '../types'

const MODEL_LABELS: Record<string, string> = {
  logistic_regression: 'LR',
  random_forest: 'RF',
  gradient_boosting: 'GB',
  neural_network: 'NN',
  llm: 'LLM',
}

export default function ResultsChart({
  experiments,
}: {
  experiments: ExperimentSummary[]
}) {
  const data = experiments.flatMap((exp) => {
    const shortName = exp.name.length > 15 ? exp.name.slice(0, 15) + '...' : exp.name
    return [
      {
        name: `${shortName} (A: ${MODEL_LABELS[exp.method_a.model_type] || exp.method_a.model_type})`,
        Accuracy: exp.method_a.accuracy ? +(exp.method_a.accuracy * 100).toFixed(1) : 0,
        Precision: exp.method_a.precision ? +(exp.method_a.precision * 100).toFixed(1) : 0,
        Recall: exp.method_a.recall ? +(exp.method_a.recall * 100).toFixed(1) : 0,
        F1: exp.method_a.f1 ? +(exp.method_a.f1 * 100).toFixed(1) : 0,
      },
      {
        name: `${shortName} (B: ${MODEL_LABELS[exp.method_b.model_type] || exp.method_b.model_type})`,
        Accuracy: exp.method_b.accuracy ? +(exp.method_b.accuracy * 100).toFixed(1) : 0,
        Precision: exp.method_b.precision ? +(exp.method_b.precision * 100).toFixed(1) : 0,
        Recall: exp.method_b.recall ? +(exp.method_b.recall * 100).toFixed(1) : 0,
        F1: exp.method_b.f1 ? +(exp.method_b.f1 * 100).toFixed(1) : 0,
      },
    ]
  })

  return (
    <div className="w-full h-80">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="Accuracy" fill="#3b82f6" />
          <Bar dataKey="Precision" fill="#10b981" />
          <Bar dataKey="Recall" fill="#f59e0b" />
          <Bar dataKey="F1" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
