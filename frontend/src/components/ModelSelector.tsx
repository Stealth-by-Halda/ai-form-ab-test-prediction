const MODEL_TYPES: { value: string; label: string; separator?: boolean }[] = [
  { value: 'logistic_regression', label: 'Logistic Regression' },
  { value: 'random_forest', label: 'Random Forest (Bagged)' },
  { value: 'gradient_boosting', label: 'Gradient Boosting' },
  { value: 'neural_network', label: 'Neural Network' },
  { value: 'llm', label: 'LLM' },
  { value: '', label: 'Ensembles', separator: true },
  { value: 'ensemble_lr_rf', label: 'LR + Random Forest' },
  { value: 'ensemble_lr_gb', label: 'LR + Gradient Boosting' },
  { value: 'ensemble_rf_gb', label: 'RF + Gradient Boosting' },
  { value: 'ensemble_nn_gb', label: 'NN + Gradient Boosting' },
  { value: 'ensemble_lr_rf_gb', label: 'LR + RF + Gradient Boosting' },
  { value: 'ensemble_all', label: 'All Models' },
]

export default function ModelSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Model Type
      </label>
      <div className="flex flex-wrap gap-2 items-center">
        {MODEL_TYPES.map((m) =>
          m.separator ? (
            <span key="separator" className="text-xs text-gray-400 font-medium mx-1">|&nbsp;{m.label}:</span>
          ) : (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange(m.value)}
              className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                value === m.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {m.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
