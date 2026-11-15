// 모델 설정. ID는 OpenAI 모델 ID이고, 환경 변수로 바꿀 수 있다.
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gpt-6-luna'

// 사용자가 고르는 메인(오케스트레이터) 모델
export const MODELS = [{ id: DEFAULT_MODEL, label: 'GPT-6 Luna' }]

// 하위 에이전트별 모델. 기본은 모두 같은 모델이고, 역할별로 바꾸고 싶으면 환경 변수를 쓴다.
export const AGENT_MODELS = {
  explore: process.env.EXPLORE_MODEL || DEFAULT_MODEL,
  librarian: process.env.LIBRARIAN_MODEL || DEFAULT_MODEL,
  oracle: process.env.ORACLE_MODEL || DEFAULT_MODEL,
  frontend: process.env.FRONTEND_MODEL || DEFAULT_MODEL,
}

export const LIMITS = {
  orchestratorSteps: 40, // 오케스트레이터가 모델을 부르는 최대 횟수
  subagentSteps: 15,
  todoReminders: 3, // 할 일이 남았는데 멈추려 할 때 다시 일하게 하는 최대 횟수
  parallelSubagents: 3,
  outputChars: 6000, // DB에 남기는 도구 출력 길이
}
