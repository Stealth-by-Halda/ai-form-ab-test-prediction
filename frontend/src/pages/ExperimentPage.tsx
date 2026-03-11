import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { ExperimentCreate } from '../types'
import ModelSelector from '../components/ModelSelector'
import FeatureSelector from '../components/FeatureSelector'
import PromptEditor, { type LLMConfig } from '../components/PromptEditor'

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  logistic_regression: { C: 1.0 },
  random_forest: { n_estimators: 100, max_depth: 5 },
  gradient_boosting: { n_estimators: 100, max_depth: 3, learning_rate: 0.1 },
  neural_network: { hidden_layer_sizes: [100, 50], max_iter: 500 },
  ensemble_lr_rf: {},
  ensemble_lr_gb: {},
  ensemble_rf_gb: {},
  ensemble_nn_gb: {},
  ensemble_lr_rf_gb: {},
  ensemble_all: {},
}

function MethodPanel({
  label,
  modelType,
  onModelTypeChange,
  sklearnConfig,
  onSklearnConfigChange,
  llmConfig,
  onLlmConfigChange,
  selectedFeatures,
}: {
  label: string
  modelType: string
  onModelTypeChange: (v: string) => void
  sklearnConfig: Record<string, unknown>
  onSklearnConfigChange: (c: Record<string, unknown>) => void
  llmConfig: LLMConfig
  onLlmConfigChange: (c: LLMConfig) => void
  selectedFeatures: string[]
}) {
  const isLLM = modelType === 'llm'

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-sm text-gray-800">{label}</h3>
      <ModelSelector value={modelType} onChange={(t) => {
        onModelTypeChange(t)
        if (t !== 'llm' && DEFAULT_CONFIGS[t]) {
          onSklearnConfigChange(DEFAULT_CONFIGS[t])
        }
      }} />
      {isLLM ? (
        <PromptEditor config={llmConfig} onChange={onLlmConfigChange} selectedFeatures={selectedFeatures} />
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hyperparameters
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg">
            {Object.entries(sklearnConfig).map(([key, val]) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-0.5">{key}</label>
                <input
                  type="text"
                  value={Array.isArray(val) ? JSON.stringify(val) : String(val)}
                  onChange={(e) => {
                    let parsed: unknown = e.target.value
                    try { parsed = JSON.parse(e.target.value) } catch { /* keep string */ }
                    onSklearnConfigChange({ ...sklearnConfig, [key]: parsed })
                  }}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExperimentPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: featureGroups } = useQuery({
    queryKey: ['features'],
    queryFn: api.getFeatures,
  })

  const [featureMode, setFeatureMode] = useState('difference')
  const [randomSeed, setRandomSeed] = useState(42)
  const [testSize, setTestSize] = useState(0.2)
  const [evalMode, setEvalMode] = useState<'single_split' | 'cross_validation'>('single_split')
  const [cvFolds, setCvFolds] = useState(5)
  const [accountEffect, setAccountEffect] = useState<'none' | 'fixed' | 'random'>('none')
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])

  // Method A state
  const [modelTypeA, setModelTypeA] = useState('logistic_regression')
  const [sklearnConfigA, setSklearnConfigA] = useState<Record<string, unknown>>(DEFAULT_CONFIGS.logistic_regression)
  const [llmConfigA, setLlmConfigA] = useState<LLMConfig>(PromptEditor.DEFAULT_CONFIG)

  // Method B state
  const [modelTypeB, setModelTypeB] = useState('random_forest')
  const [sklearnConfigB, setSklearnConfigB] = useState<Record<string, unknown>>(DEFAULT_CONFIGS.random_forest)
  const [llmConfigB, setLlmConfigB] = useState<LLMConfig>(PromptEditor.DEFAULT_CONFIG)

  const [initialized, setInitialized] = useState(false)

  if (featureGroups && !initialized) {
    const defaults = [
      ...featureGroups.find((g) => g.category === 'demographics')?.columns || [],
      ...featureGroups.find((g) => g.category === 'form_config')?.columns || [],
    ]
    setSelectedFeatures(defaults)
    setInitialized(true)
  }

  const mutation = useMutation({
    mutationFn: (data: ExperimentCreate) => api.createExperiment(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
      navigate(`/results/${result.id}`)
    },
  })

  const MODEL_SHORT: Record<string, string> = {
    logistic_regression: 'LR',
    random_forest: 'RF',
    gradient_boosting: 'GB',
    neural_network: 'NN',
    llm: 'LLM',
    ensemble_lr_rf: 'Ens(LR+RF)',
    ensemble_lr_gb: 'Ens(LR+GB)',
    ensemble_rf_gb: 'Ens(RF+GB)',
    ensemble_nn_gb: 'Ens(NN+GB)',
    ensemble_lr_rf_gb: 'Ens(LR+RF+GB)',
    ensemble_all: 'Ens(All)',
  }

  const buildAutoName = () => {
    const a = MODEL_SHORT[modelTypeA] || modelTypeA
    const b = MODEL_SHORT[modelTypeB] || modelTypeB
    const parts = [`${a} vs ${b}`]
    parts.push(featureMode === 'concatenated' ? 'concat' : 'diff')
    if (evalMode === 'cross_validation') {
      parts.push(`${cvFolds}-fold CV`)
    } else {
      parts.push(`${Math.round(testSize * 100)}%test`)
    }
    parts.push(`seed${randomSeed}`)
    if (accountEffect === 'fixed') parts.push('acctFE')
    if (accountEffect === 'random') parts.push('acctRE')
    parts.push(`${selectedFeatures.length}feat`)

    // Add non-default hyperparams for sklearn models
    const describeConfig = (type: string, config: Record<string, unknown>) => {
      const defaults = DEFAULT_CONFIGS[type]
      if (!defaults || Object.keys(config).length === 0) return ''
      const diffs = Object.entries(config)
        .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(defaults[k]))
        .map(([k, v]) => `${k}=${Array.isArray(v) ? JSON.stringify(v) : v}`)
      return diffs.join(',')
    }
    const diffA = describeConfig(modelTypeA, sklearnConfigA)
    const diffB = describeConfig(modelTypeB, sklearnConfigB)
    if (diffA) parts.push(`A(${diffA})`)
    if (diffB) parts.push(`B(${diffB})`)

    return parts.join(' | ')
  }

  const handleSubmit = () => {
    const isLlmA = modelTypeA === 'llm'
    const isLlmB = modelTypeB === 'llm'
    const apiKey = isLlmA ? llmConfigA.api_key : isLlmB ? llmConfigB.api_key : undefined

    const payload: ExperimentCreate = {
      name: buildAutoName(),
      method_a: {
        model_type: modelTypeA,
        config: isLlmA
          ? { provider: llmConfigA.provider, model: llmConfigA.model, prompt_template: llmConfigA.prompt_template }
          : sklearnConfigA,
      },
      method_b: {
        model_type: modelTypeB,
        config: isLlmB
          ? { provider: llmConfigB.provider, model: llmConfigB.model, prompt_template: llmConfigB.prompt_template }
          : sklearnConfigB,
      },
      feature_columns: selectedFeatures,
      feature_mode: featureMode,
      random_seed: randomSeed,
      test_size: testSize,
      eval_mode: evalMode,
      cv_folds: cvFolds,
      account_effect: accountEffect,
      api_key: apiKey,
    }
    mutation.mutate(payload)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Run Experiment</h1>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Auto-generated name preview */}
        <div className="text-sm text-gray-500">
          <span className="font-medium text-gray-700">Name: </span>{buildAutoName()}
        </div>

        {/* Two method panels side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MethodPanel
            label="Method A"
            modelType={modelTypeA}
            onModelTypeChange={setModelTypeA}
            sklearnConfig={sklearnConfigA}
            onSklearnConfigChange={setSklearnConfigA}
            llmConfig={llmConfigA}
            onLlmConfigChange={setLlmConfigA}
            selectedFeatures={selectedFeatures}
          />
          <MethodPanel
            label="Method B"
            modelType={modelTypeB}
            onModelTypeChange={setModelTypeB}
            sklearnConfig={sklearnConfigB}
            onSklearnConfigChange={setSklearnConfigB}
            llmConfig={llmConfigB}
            onLlmConfigChange={setLlmConfigB}
            selectedFeatures={selectedFeatures}
          />
        </div>

        {/* Shared settings */}
        <div className="border-t border-gray-200 pt-4 space-y-4">
          <h3 className="font-semibold text-sm text-gray-800">Shared Settings</h3>

          {/* Feature mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Feature Mode
            </label>
            <div className="flex gap-3">
              {['difference', 'concatenated'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFeatureMode(mode)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    featureMode === mode
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Account effect */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Effect
            </label>
            <div className="flex gap-2 mb-1">
              {([
                ['none', 'None'],
                ['fixed', 'Fixed Effect'],
                ['random', 'Random Effect'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAccountEffect(value)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    accountEffect === value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">
              {accountEffect === 'fixed'
                ? 'Adds one-hot dummy variables per account (high-dimensional, no leakage)'
                : accountEffect === 'random'
                ? 'Target-encodes account as mean outcome from training data (single feature, acts as random intercept)'
                : 'No account-level adjustment'}
            </span>
          </div>

          {/* Feature selector */}
          {featureGroups && (
            <FeatureSelector
              featureGroups={featureGroups}
              selected={selectedFeatures}
              onChange={setSelectedFeatures}
            />
          )}

          {/* Evaluation mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Evaluation Mode
            </label>
            <div className="flex gap-2 mb-3">
              {([['single_split', 'Single Split'], ['cross_validation', 'Cross-Validation']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEvalMode(mode)}
                  className={`px-3 py-1.5 rounded text-sm border ${
                    evalMode === mode
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {evalMode === 'single_split' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Test Set Size
                </label>
                <div className="flex gap-2">
                  {[0.1, 0.15, 0.2, 0.25, 0.3].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setTestSize(size)}
                      className={`px-3 py-1.5 rounded text-sm border ${
                        testSize === size
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      {Math.round(size * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Folds
                </label>
                <div className="flex gap-2">
                  {[3, 5, 10].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCvFolds(k)}
                      className={`px-3 py-1.5 rounded text-sm border ${
                        cvFolds === k
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >
                      {k}-fold
                    </button>
                  ))}
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={cvFolds}
                    onChange={(e) => setCvFolds(Number(e.target.value))}
                    className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Random seed */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Random Seed
            </label>
            <input
              type="number"
              value={randomSeed}
              onChange={(e) => setRandomSeed(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="px-6 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? 'Running...' : 'Run Experiment'}
        </button>

        {mutation.isError && (
          <div className="text-red-600 text-sm mt-2">
            Error: {(mutation.error as Error).message}
          </div>
        )}
      </div>
    </div>
  )
}
