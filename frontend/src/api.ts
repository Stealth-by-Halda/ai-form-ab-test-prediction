import type {
  TestSummary, TestDetail, TestStats, FeatureGroup,
  ExperimentCreate, ExperimentSummary, ExperimentDetail,
} from './types';

const BASE = '/api';

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  getTests: () => fetchJSON<TestSummary[]>('/tests'),
  getTest: (id: string) => fetchJSON<TestDetail>(`/tests/${id}`),
  getTestStats: () => fetchJSON<TestStats>('/tests/stats'),
  getFeatures: () => fetchJSON<FeatureGroup[]>('/features'),
  getTemplateVariables: () => fetchJSON<{ variables: string[] }>('/features/template-variables'),

  createExperiment: (data: ExperimentCreate) =>
    fetchJSON<ExperimentSummary>('/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getExperiments: () => fetchJSON<ExperimentSummary[]>('/experiments'),
  getExperiment: (id: number) => fetchJSON<ExperimentDetail>(`/experiments/${id}`),
  deleteExperiment: (id: number) =>
    fetchJSON<{ status: string }>(`/experiments/${id}`, { method: 'DELETE' }),

  getSources: () =>
    fetchJSON<Record<string, string>>('/methodology/sources'),

  buildPrompt: (data: {
    instructions: string
    provider: string
    model: string
    api_key: string
    selected_features: string[]
  }) =>
    fetchJSON<{ prompt_template: string }>('/features/build-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
