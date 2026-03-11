import type { PredictionDetail } from '../types'

export default function ConfusionMatrix({
  predictions,
}: {
  predictions: PredictionDetail[]
}) {
  // Compute confusion matrix: actual vs predicted
  let tp = 0, fp = 0, tn = 0, fn = 0
  for (const p of predictions) {
    if (p.actual_winner_is_b === 1 && p.predicted_winner_is_b === 1) tp++
    else if (p.actual_winner_is_b === 0 && p.predicted_winner_is_b === 1) fp++
    else if (p.actual_winner_is_b === 0 && p.predicted_winner_is_b === 0) tn++
    else fn++
  }

  const cells = [
    [tn, fp],
    [fn, tp],
  ]
  const labels = ['Pred A', 'Pred B']
  const rowLabels = ['Actual A', 'Actual B']

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Confusion Matrix</h3>
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            <th className="w-20"></th>
            {labels.map((l) => (
              <th key={l} className="px-4 py-2 text-center text-gray-600 font-medium">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.map((row, ri) => (
            <tr key={ri}>
              <td className="px-2 py-2 text-gray-600 font-medium text-right">
                {rowLabels[ri]}
              </td>
              {row.map((val, ci) => {
                const isCorrect = ri === ci
                return (
                  <td
                    key={ci}
                    className={`px-4 py-3 text-center text-lg font-bold border ${
                      isCorrect
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
