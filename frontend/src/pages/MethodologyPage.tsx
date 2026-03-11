import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

interface MethodInfo {
  id: string
  title: string
  description: string
  sourceFile: 'ml_pipeline' | 'llm_pipeline' | 'feature_engineering'
  highlightLines?: string
}

const METHODS: MethodInfo[] = [
  {
    id: 'overview',
    title: 'Pipeline Overview',
    description:
      'Every experiment runs two methods (A and B) on the same data split. The pipeline builds a feature matrix from the database, splits the data (single train/test split or stratified k-fold cross-validation), trains each method, and computes accuracy, precision, recall, and F1 across predictions. For cross-validation, metrics are computed over all out-of-fold predictions combined.',
    sourceFile: 'ml_pipeline',
  },
  {
    id: 'feature_engineering',
    title: 'Feature Engineering',
    description:
      'Features are extracted from A/B test variant metadata. Columns are classified into demographics, form configuration, question structure, and question text categories. Two feature modes are supported: "difference" (B\u2009\u2212\u2009A for each feature) produces a single vector of contrasts, while "concatenated" stacks both variants\' features side-by-side. Optional account fixed effects add one-hot dummy variables (dropping the first account as a reference category) to control for account-level variation. NaN values are replaced with 0.',
    sourceFile: 'feature_engineering',
  },
  {
    id: 'logistic_regression',
    title: 'Logistic Regression',
    description:
      'A linear classification model from scikit-learn. It models the log-odds of variant B winning as a linear combination of features. The regularization strength is controlled by the C parameter (default 1.0; higher C = less regularization). Uses up to 1000 iterations for convergence. Feature importances are derived from the absolute values of the learned coefficients, normalized to sum to 1.',
    sourceFile: 'ml_pipeline',
  },
  {
    id: 'random_forest',
    title: 'Random Forest',
    description:
      'An ensemble of decision trees, each trained on a random bootstrap sample with random feature subsets. Predictions are made by majority vote across all trees. Configurable parameters: n_estimators (number of trees, default 100) and max_depth (maximum tree depth, default unlimited). Feature importances come from the mean decrease in Gini impurity across all trees.',
    sourceFile: 'ml_pipeline',
  },
  {
    id: 'gradient_boosting',
    title: 'Gradient Boosting',
    description:
      'Builds an ensemble of shallow decision trees sequentially, where each new tree corrects the errors of the previous ensemble. Configurable parameters: n_estimators (number of boosting stages, default 100), max_depth (depth per tree, default 3), and learning_rate (shrinkage factor, default 0.1). Feature importances are based on how often each feature is used in splits, weighted by improvement.',
    sourceFile: 'ml_pipeline',
  },
  {
    id: 'neural_network',
    title: 'Neural Network (MLP)',
    description:
      'A multi-layer perceptron classifier with configurable hidden layer sizes (default: one hidden layer of 100 neurons). Uses the Adam optimizer with up to 500 training iterations. Feature importances are approximated by summing the absolute values of the first-layer weight matrix for each input feature, then normalizing.',
    sourceFile: 'ml_pipeline',
  },
  {
    id: 'ensembles',
    title: 'Ensemble Methods',
    description:
      'Voting classifiers that combine multiple base models using soft voting (averaged predicted probabilities). Available combinations: LR+RF, LR+GB, RF+GB, NN+GB, LR+RF+GB, and All (LR+RF+GB+NN). Each sub-model uses default hyperparameters. Feature importances are computed by extracting normalized importances from each sub-estimator and averaging them.',
    sourceFile: 'ml_pipeline',
  },
  {
    id: 'llm',
    title: 'LLM (Large Language Model)',
    description:
      'Sends each test example to an LLM (OpenAI or Anthropic) with a user-defined prompt template. The prompt is filled with variant features as template variables (e.g., {variant_a_COLUMN_NAME}). The LLM response is parsed for an A/B prediction by checking for keywords like "Variant B", "Answer: A", or a standalone "A"/"B". If parsing fails, defaults to predicting A. Temperature is set to 0 for deterministic outputs.',
    sourceFile: 'llm_pipeline',
  },
]

function CodeBlock({ code, filename }: { code: string; filename: string }) {
  const [collapsed, setCollapsed] = useState(true)
  const lines = code.split('\n')

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-mono text-gray-700 border-b border-gray-200"
      >
        <span>{filename}</span>
        <span className="text-gray-400 text-xs">
          {lines.length} lines {collapsed ? '(click to expand)' : '(click to collapse)'}
        </span>
      </button>
      {!collapsed && (
        <div className="overflow-x-auto bg-gray-900 text-gray-100">
          <pre className="text-xs leading-relaxed p-0 m-0">
            <code>
              {lines.map((line, i) => (
                <div key={i} className="flex hover:bg-gray-800/50">
                  <span className="select-none text-gray-500 text-right pr-4 pl-3 py-0 min-w-[3rem] border-r border-gray-700/50">
                    {i + 1}
                  </span>
                  <span className="pl-4 pr-4 py-0 whitespace-pre">{line}</span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  )
}

export default function MethodologyPage() {
  const { data: sources, isLoading } = useQuery({
    queryKey: ['methodology-sources'],
    queryFn: api.getSources,
  })

  const [activeSection, setActiveSection] = useState('overview')

  const FILE_NAMES: Record<string, string> = {
    ml_pipeline: 'ml_pipeline.py',
    llm_pipeline: 'llm_pipeline.py',
    feature_engineering: 'feature_engineering.py',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Methodology</h1>
      <p className="text-sm text-gray-500 mb-6">
        How each prediction method works, with the actual Python source code used to run experiments.
      </p>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-48 flex-shrink-0 space-y-1">
          {METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveSection(m.id)}
              className={`block w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                activeSection === m.id
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {m.title}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-6">
          {METHODS.filter((m) => m.id === activeSection).map((method) => (
            <div key={method.id} className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-3">{method.title}</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {method.description}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Source Code</h3>
                {isLoading ? (
                  <div className="text-sm text-gray-400">Loading source files...</div>
                ) : sources ? (
                  <CodeBlock
                    code={sources[method.sourceFile] || '# File not found'}
                    filename={FILE_NAMES[method.sourceFile]}
                  />
                ) : (
                  <div className="text-sm text-gray-400">Failed to load source files.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
