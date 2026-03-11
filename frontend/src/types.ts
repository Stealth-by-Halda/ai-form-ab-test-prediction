export interface TestSummary {
  ab_test_id: string;
  account_id: string;
  form_name: string;
  p_value: number;
  winner_variant_id: string;
  variant_a_id: string;
  variant_b_id: string;
  winner_is_b: number;
}

export interface VariantDetail {
  variant_id: string;
  variant_name: string;
  total_visit_count: number;
  total_lead_count: number;
  conversion_rate: number;
  features: Record<string, number | string | null>;
}

export interface TestDetail extends TestSummary {
  variant_a: VariantDetail;
  variant_b: VariantDetail;
}

export interface TestStats {
  total_tests: number;
  a_wins: number;
  b_wins: number;
  avg_p_value: number;
  min_p_value: number;
  max_p_value: number;
}

export interface FeatureGroup {
  category: string;
  columns: string[];
}

export interface MethodConfig {
  model_type: string;
  config: Record<string, unknown>;
}

export interface ExperimentCreate {
  name: string;
  method_a: MethodConfig;
  method_b: MethodConfig;
  feature_columns: string[];
  feature_mode: string;
  random_seed: number;
  test_size: number;
  account_effect: string;
  eval_mode: string;
  cv_folds: number;
  api_key?: string;
}

export interface MethodMetrics {
  model_type: string;
  config: Record<string, unknown>;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface ExperimentSummary {
  id: number;
  name: string;
  method_a: MethodMetrics;
  method_b: MethodMetrics;
  feature_mode: string;
  feature_columns: string[];
  random_seed: number;
  account_effect: string;
  test_size: number;
  eval_mode: string;
  cv_folds: number;
  num_train: number | null;
  num_test: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface PredictionDetail {
  ab_test_id: string;
  method: string;
  predicted_winner_is_b: number;
  actual_winner_is_b: number;
  correct: number;
  confidence: number | null;
  raw_output: string | null;
  fold: number | null;
}

export interface ExperimentDetail extends ExperimentSummary {
  predictions_a: PredictionDetail[];
  predictions_b: PredictionDetail[];
  feature_importances_a: Record<string, number> | null;
  feature_importances_b: Record<string, number> | null;
}
