import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api'

const LLM_MODELS = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-haiku-4-5-20251001',
    'claude-haiku-35-20241022',
    'claude-opus-4-20250514',
  ],
}

// Build question block for one variant
function _questionBlock(variant: 'a' | 'b', maxQ = 36): string {
  const lines: string[] = []
  for (let i = 1; i <= maxQ; i++) {
    const prefix = `variant_${variant}`
    lines.push(
      `  Q${i}: text={${prefix}_Q${i}_TEXT} | required={${prefix}_Q${i}_IS_REQUIRED} | ` +
      `type: first_name={${prefix}_Q${i}_TYPE_FIRST_NAME} last_name={${prefix}_Q${i}_TYPE_LAST_NAME} ` +
      `email={${prefix}_Q${i}_TYPE_EMAIL_ADDRESS} phone={${prefix}_Q${i}_TYPE_PHONE_NUMBER} ` +
      `dropdown={${prefix}_Q${i}_TYPE_DROPDOWN} radio={${prefix}_Q${i}_TYPE_RADIO_BUTTON} ` +
      `checkbox={${prefix}_Q${i}_TYPE_CHECKBOX} short_answer={${prefix}_Q${i}_TYPE_SHORT_ANSWER} ` +
      `list={${prefix}_Q${i}_TYPE_LIST} slider={${prefix}_Q${i}_TYPE_SLIDER} ` +
      `high_school={${prefix}_Q${i}_TYPE_HIGH_SCHOOL} zip={${prefix}_Q${i}_TYPE_ZIP_CODE} ` +
      `program_start={${prefix}_Q${i}_TYPE_PROGRAM_START} dob={${prefix}_Q${i}_TYPE_DATE_OF_BIRTH} ` +
      `date_picker={${prefix}_Q${i}_TYPE_DATE_PICKER} paragraph={${prefix}_Q${i}_TYPE_PARAGRAPH} ` +
      `statement={${prefix}_Q${i}_TYPE_STATEMENT} question_group={${prefix}_Q${i}_TYPE_QUESTION_GROUP}`
    )
  }
  return lines.join('\n')
}

const DEFAULT_PROMPT = `You are an expert at analyzing A/B tests for higher education lead generation forms. Your task is to predict which variant has a higher conversion rate based on form structure, question design, and configuration.

Form: {form_name}

=== VARIANT A: {variant_a_name} ===

Form structure:
- Screens: {variant_a_SCREEN_COUNT}
- Total questions: {variant_a_QUESTION_COUNT}
- Required questions: {variant_a_REQUIRED_QUESTION_COUNT}

Display settings:
- Desktop: {variant_a_SHOW_ON_DESKTOP} | Mobile: {variant_a_SHOW_ON_MOBILE}
- Trigger type: welcome={variant_a_TRIGGER_TYPE_WELCOME} delay={variant_a_TRIGGER_TYPE_DELAY} exit={variant_a_TRIGGER_TYPE_EXIT} scroll={variant_a_TRIGGER_TYPE_SCROLL}
- Trigger value: {variant_a_TRIGGER_VALUE}
- Frequency: every_visit={variant_a_FREQUENCY_TYPE_EVERY_VISIT} once={variant_a_FREQUENCY_TYPE_ONCE} return_visit={variant_a_FREQUENCY_TYPE_RETURN_VISIT}
- Display method: modal={variant_a_DISPLAY_METHOD_MODAL} modal_medallion={variant_a_DISPLAY_METHOD_MODAL_MEDALLION} slide_out={variant_a_DISPLAY_METHOD_SLIDE_OUT} hub_open={variant_a_DISPLAY_METHOD_HUB_OPEN} hub_closed={variant_a_DISPLAY_METHOD_HUB_CLOSED}
- Target: all={variant_a_TARGET_TYPE_ALL} custom={variant_a_TARGET_TYPE_CUSTOM} dlp={variant_a_TARGET_TYPE_DLP_TARGETED_PAGES}

Billboard:
- Logo enabled: {variant_a_BILLBOARD_LOGO_ENABLED}
- Display: split_screen={variant_a_BILLBOARD_DISPLAY_METHOD_SPLIT_SCREEN} full_screen={variant_a_BILLBOARD_DISPLAY_METHOD_FULL_SCREEN} none={variant_a_BILLBOARD_DISPLAY_METHOD_NONE}
- Mobile display: split_screen={variant_a_MOBILE_BILLBOARD_DISPLAY_METHOD_SPLIT_SCREEN} full_screen={variant_a_MOBILE_BILLBOARD_DISPLAY_METHOD_FULL_SCREEN} none={variant_a_MOBILE_BILLBOARD_DISPLAY_METHOD_NONE}
- Background: solid={variant_a_BILLBOARD_BACKGROUND_TYPE_SOLID_COLOR} gradient={variant_a_BILLBOARD_BACKGROUND_TYPE_GRADIENT}

Navigation:
- Button alignment: left={variant_a_SCREEN_BUTTON_ALIGNMENT_LEFT} center={variant_a_SCREEN_BUTTON_ALIGNMENT_CENTER} right={variant_a_SCREEN_BUTTON_ALIGNMENT_RIGHT}
- Nav buttons: colored={variant_a_SCREEN_NAV_BUTTONS_TYPE_COLORED} text_chevron={variant_a_SCREEN_NAV_BUTTONS_TYPE_TEXT_AND_CHEVRON} chevron_only={variant_a_SCREEN_NAV_BUTTONS_TYPE_CHEVRON_ONLY}

Progress bar: {variant_a_AB_TEST_HAS_PROGRESS_BAR}

Questions (text, required, type — ignore questions where text=N/A or text=None):
` + _questionBlock('a') + `

=== VARIANT B: {variant_b_name} ===

Form structure:
- Screens: {variant_b_SCREEN_COUNT}
- Total questions: {variant_b_QUESTION_COUNT}
- Required questions: {variant_b_REQUIRED_QUESTION_COUNT}

Display settings:
- Desktop: {variant_b_SHOW_ON_DESKTOP} | Mobile: {variant_b_SHOW_ON_MOBILE}
- Trigger type: welcome={variant_b_TRIGGER_TYPE_WELCOME} delay={variant_b_TRIGGER_TYPE_DELAY} exit={variant_b_TRIGGER_TYPE_EXIT} scroll={variant_b_TRIGGER_TYPE_SCROLL}
- Trigger value: {variant_b_TRIGGER_VALUE}
- Frequency: every_visit={variant_b_FREQUENCY_TYPE_EVERY_VISIT} once={variant_b_FREQUENCY_TYPE_ONCE} return_visit={variant_b_FREQUENCY_TYPE_RETURN_VISIT}
- Display method: modal={variant_b_DISPLAY_METHOD_MODAL} modal_medallion={variant_b_DISPLAY_METHOD_MODAL_MEDALLION} slide_out={variant_b_DISPLAY_METHOD_SLIDE_OUT} hub_open={variant_b_DISPLAY_METHOD_HUB_OPEN} hub_closed={variant_b_DISPLAY_METHOD_HUB_CLOSED}
- Target: all={variant_b_TARGET_TYPE_ALL} custom={variant_b_TARGET_TYPE_CUSTOM} dlp={variant_b_TARGET_TYPE_DLP_TARGETED_PAGES}

Billboard:
- Logo enabled: {variant_b_BILLBOARD_LOGO_ENABLED}
- Display: split_screen={variant_b_BILLBOARD_DISPLAY_METHOD_SPLIT_SCREEN} full_screen={variant_b_BILLBOARD_DISPLAY_METHOD_FULL_SCREEN} none={variant_b_BILLBOARD_DISPLAY_METHOD_NONE}
- Mobile display: split_screen={variant_b_MOBILE_BILLBOARD_DISPLAY_METHOD_SPLIT_SCREEN} full_screen={variant_b_MOBILE_BILLBOARD_DISPLAY_METHOD_FULL_SCREEN} none={variant_b_MOBILE_BILLBOARD_DISPLAY_METHOD_NONE}
- Background: solid={variant_b_BILLBOARD_BACKGROUND_TYPE_SOLID_COLOR} gradient={variant_b_BILLBOARD_BACKGROUND_TYPE_GRADIENT}

Navigation:
- Button alignment: left={variant_b_SCREEN_BUTTON_ALIGNMENT_LEFT} center={variant_b_SCREEN_BUTTON_ALIGNMENT_CENTER} right={variant_b_SCREEN_BUTTON_ALIGNMENT_RIGHT}
- Nav buttons: colored={variant_b_SCREEN_NAV_BUTTONS_TYPE_COLORED} text_chevron={variant_b_SCREEN_NAV_BUTTONS_TYPE_TEXT_AND_CHEVRON} chevron_only={variant_b_SCREEN_NAV_BUTTONS_TYPE_CHEVRON_ONLY}

Progress bar: {variant_b_AB_TEST_HAS_PROGRESS_BAR}

Questions (text, required, type — ignore questions where text=N/A or text=None):
` + _questionBlock('b') + `

=== DEMOGRAPHICS (shared across both variants) ===
- Domestic In-State: {variant_a_Domestic: In-State} | Out-of-State: {variant_a_Domestic: Out-of-State}
- Markets: Local={variant_a_Market 1: Local (<25mi)} Regional={variant_a_Market 2: Regional (25-150mi)} National={variant_a_Market 3: National (>150mi)} International={variant_a_Market 4: International}
- Level: Grad={variant_a_Grad} Undergrad={variant_a_Undergraduate} PhD={variant_a_PhD}
- Gender: Male={variant_a_Male} Female={variant_a_Female}
- Age: Traditional={variant_a_Traditional Age} Adult={variant_a_Adult Learner}
- Income: Low={variant_a_Low Income} Mid={variant_a_Mid Income} High={variant_a_High Income}
- Other: First-Gen={variant_a_First-Generation} Transfer={variant_a_Is Transfer}
- Modality: Online={variant_a_Seeking Online Only} Hybrid={variant_a_Seeking Hybrid} In-Person={variant_a_Seeking In-Person Only}

=== INSTRUCTIONS ===
Based on all the information above, predict which variant has the higher conversion rate. Consider:
1. Form length and complexity (number of screens, questions, required fields)
2. Question types and their text (ease of completion, relevance)
3. Display method and trigger settings (user experience)
4. Billboard and navigation design
5. Target audience demographics

Answer with just "A" or "B".`

export interface LLMConfig {
  provider: string
  model: string
  prompt_template: string
  api_key: string
}

export default function PromptEditor({
  config,
  onChange,
  selectedFeatures = [],
}: {
  config: LLMConfig
  onChange: (c: LLMConfig) => void
  selectedFeatures?: string[]
}) {
  const { data: templateVars } = useQuery({
    queryKey: ['template-variables'],
    queryFn: api.getTemplateVariables,
  })
  const [searchVar, setSearchVar] = useState('')
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderInstructions, setBuilderInstructions] = useState('')

  const buildMutation = useMutation({
    mutationFn: () =>
      api.buildPrompt({
        instructions: builderInstructions,
        provider: config.provider,
        model: config.model,
        api_key: config.api_key,
        selected_features: selectedFeatures,
      }),
    onSuccess: (result) => {
      onChange({ ...config, prompt_template: result.prompt_template })
      setBuilderOpen(false)
      setBuilderInstructions('')
    },
  })

  const models = LLM_MODELS[config.provider as keyof typeof LLM_MODELS] || []

  const filteredVars = (templateVars?.variables || []).filter((v) =>
    v.toLowerCase().includes(searchVar.toLowerCase())
  )

  const insertVariable = (varName: string) => {
    onChange({ ...config, prompt_template: config.prompt_template + `{${varName}}` })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Provider
          </label>
          <select
            value={config.provider}
            onChange={(e) =>
              onChange({
                ...config,
                provider: e.target.value,
                model:
                  LLM_MODELS[e.target.value as keyof typeof LLM_MODELS]?.[0] || '',
              })
            }
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Model
          </label>
          <select
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          API Key
        </label>
        <input
          type="password"
          value={config.api_key}
          onChange={(e) => onChange({ ...config, api_key: e.target.value })}
          placeholder="Leave blank to use server env var"
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
        />
      </div>

      {/* AI Prompt Builder */}
      <div className="border border-purple-200 rounded-lg bg-purple-50 p-3">
        <button
          type="button"
          onClick={() => setBuilderOpen(!builderOpen)}
          className="flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-800"
        >
          <span className="text-lg">&#9733;</span>
          {builderOpen ? 'Close AI Prompt Builder' : 'Build Prompt with AI'}
        </button>
        {builderOpen && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-purple-600">
              Describe what you want the prompt to do. The AI will generate a prompt template using the available variables
              {selectedFeatures.length > 0 ? `, focusing on your ${selectedFeatures.length} selected features` : ''}.
            </p>
            <textarea
              value={builderInstructions}
              onChange={(e) => setBuilderInstructions(e.target.value)}
              rows={3}
              placeholder="e.g., Compare form complexity, question count, and device targeting to predict which variant converts better. Consider how the number of screens and required fields might affect user drop-off."
              className="w-full border border-purple-300 rounded px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => buildMutation.mutate()}
              disabled={!builderInstructions.trim() || buildMutation.isPending}
              className="px-4 py-1.5 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buildMutation.isPending ? 'Generating...' : 'Generate Prompt'}
            </button>
            {buildMutation.isError && (
              <p className="text-xs text-red-600">
                Error: {(buildMutation.error as Error).message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Prompt template + variable sidebar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Prompt Template
          </label>
          <textarea
            value={config.prompt_template}
            onChange={(e) =>
              onChange({ ...config, prompt_template: e.target.value })
            }
            rows={24}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
            placeholder="Write your prompt template. Use {variable_name} for placeholders."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Variables (click to insert)
          </label>
          <input
            type="text"
            value={searchVar}
            onChange={(e) => setSearchVar(e.target.value)}
            placeholder="Search..."
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-1"
          />
          <div className="h-72 overflow-y-auto border border-gray-200 rounded p-1 space-y-0.5">
            {filteredVars.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="block w-full text-left px-1.5 py-0.5 text-xs font-mono text-blue-600 hover:bg-blue-50 rounded truncate"
                title={v}
              >
                {'{' + v + '}'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

PromptEditor.DEFAULT_PROMPT = DEFAULT_PROMPT
PromptEditor.DEFAULT_CONFIG = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  prompt_template: DEFAULT_PROMPT,
  api_key: '',
} as LLMConfig
