# CLAUDE.md

speak in korean

## Project Overview

강사용 채팅 프론트엔드 — [agent-chat-ui](https://github.com/langchain-ai/agent-chat-ui) 포크.
백엔드(LangGraph 에이전트)는 **별도 모노레포** `~/dev/my-chat-ui`에서 관리한다.

---

## Architecture

```
이 레포 (프론트엔드)              모노레포 (백엔드)
instructor-chat-ui/              my-chat-ui/apps/agents/
├── src/components/custom/  ←──  push_ui_message("jsxgraph_interactive", ...)
├── src/app/api/[..._path]/ ───→ LangGraph 서버 (localhost:2024)
└── .env.local                   └── instructor_graph.py (instructor_agent)
```

- **API 프록시 패턴**: 브라우저 → Next.js API Route(`/api/...`) → LangGraph 서버. CORS 우회.
- **Generative UI**: 백엔드 `push_ui_message(name, props)` → 프론트 `CUSTOM_COMPONENTS[name]` 렌더링

---

## Development

```bash
# 1. 백엔드 먼저 (모노레포에서)
cd ~/dev/my-chat-ui/apps/agents
npx @langchain/langgraph-cli dev --port 2024

# 2. 프론트엔드
PORT=3003 pnpm dev
```

접속: http://localhost:3003

---

## 커스텀 컴포넌트 추가 규칙

새 Generative UI 컴포넌트 추가 시:

1. `src/components/custom/` 에 컴포넌트 파일 생성
2. `src/components/custom/index.ts`의 `CUSTOM_COMPONENTS`에 등록
3. 키 이름은 백엔드 `push_ui_message(name, ...)` 의 `name`과 동일해야 함

```typescript
// src/components/custom/index.ts
export const CUSTOM_COMPONENTS: Record<string, React.FunctionComponent<any>> = {
  jsxgraph_interactive: JSXGraphInteractive,
  // 새 컴포넌트 추가 시 여기에 등록
};
```

---

## Upstream 동기화

이 레포는 `langchain-ai/agent-chat-ui` 포크이다.

```bash
# upstream 업데이트 가져오기
git fetch upstream
git merge upstream/main --no-ff
```

**주의**: 머지 시 아래 파일은 우리 커스터마이징이 우선:
- `src/components/thread/messages/ai.tsx` — `CUSTOM_COMPONENTS` import + `message_id` fallback 로직
- `src/components/custom/` — 전체 디렉토리
- `src/lib/jsxgraph/`, `src/lib/schemas/` — JSXGraph 관련 모듈

---

## 핵심 커스터마이징 (upstream과 다른 부분)

| 파일 | 변경 내용 |
|------|----------|
| `src/components/thread/messages/ai.tsx` | `CUSTOM_COMPONENTS` 연동 + `message_id` 없는 UI 메시지를 마지막 AI 메시지에 fallback |
| `src/components/custom/index.ts` | 커스텀 컴포넌트 레지스트리 |
| `src/components/custom/JSXGraphInteractive.tsx` | JSXGraph 인터랙티브 시각화 컴포넌트 |
| `src/lib/jsxgraph/runtime.ts` | JSXGraph CDN 로더 |
| `src/lib/schemas/jsxgraph-interactive.ts` | Zod 검증 스키마 |

---

## Environment Variables

| 변수 | 로컬 개발 | 프로덕션 |
|------|----------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3003/api` | `/api` |
| `NEXT_PUBLIC_ASSISTANT_ID` | `instructor_agent` | `instructor_agent` |
| `LANGGRAPH_API_URL` | `http://localhost:2024` | LangGraph Cloud URL |
| `LANGSMITH_API_KEY` | (선택) | 필수 |

---

## 의존성 주의

- **zod**: 3.x 사용 (4.x 아님). 스키마 코드가 zod 3.x API 기반.
- **jsxgraph**: CDN으로도 로드하지만 타입 참조용으로 설치됨.
