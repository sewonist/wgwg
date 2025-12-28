# Development Plan: Layered Ontology Timeline Viewer

## Meta Information
- **Created**: 2025-12-28 19:38:26
- **Type**: Feature Development
- **Priority**: High
- **Estimated Complexity**: Complex

## 1. Overview

이 기능은 각 analyze 결과의 온톨로지 노드를 개별 층위(Layer)로 표현하고, 화면 우측에 타임라인 UI를 배치하여 층 간 이동을 시각적으로 표현하는 새로운 뷰어를 개발하는 것입니다.

### 1.1 핵심 차별점
| 기존 visualize | 새로운 layered-view |
|----------------|---------------------|
| 모든 노드를 하나의 평면에 연결 | 각 analyze 결과를 개별 층으로 분리 |
| 누적된 통합 그래프 | 시간순 층위 기반 그래프 |
| 2D Force Graph | Top-view 층간 이동 (3D-like perspective) |
| 단일 온톨로지 조회 | 층별 온톨로지 + 타임라인 네비게이션 |

### 1.2 사용자 시나리오
1. 사용자가 `/layered-view/{sessionId}` 페이지에 접속
2. 각 analyze 결과가 시간순으로 층(Layer)으로 쌓임
3. 우측 타임라인에서 특정 층 클릭 시 해당 층으로 이동 (Top-view 관점에서 층간 이동 애니메이션)
4. 층 내의 노드들은 해당 시점의 온톨로지만 표시

## 2. Current State Analysis

### 2.1 Relevant Files

| File | Purpose | Modification Type |
|------|---------|-------------------|
| `client/app/layered-view/page.tsx` | 세션 생성 후 리다이렉트 페이지 | Create |
| `client/app/layered-view/[sessionId]/page.tsx` | 층위 기반 온톨로지 뷰어 메인 페이지 | Create |
| `client/app/api/layered-sessions/route.ts` | 층위 세션 목록 API | Create |
| `client/app/api/layered-sessions/[sessionId]/route.ts` | 단일 세션 조회/삭제 API | Create |
| `client/app/api/layered-analyze/route.ts` | 층위 기반 분석 및 저장 API | Create |
| `client/lib/layered-session-router.ts` | 층위 기반 세션 Redis 관리 라이브러리 | Create |
| `client/components/timeline-navigator.tsx` | 타임라인 네비게이션 컴포넌트 | Create |
| `client/components/layered-graph.tsx` | 층위 기반 그래프 컴포넌트 | Create |

### 2.2 Current Architecture

#### 기존 시스템 구조 분석

```
[WebSocket /ws/chat]
       |
       v
[client/app/visualize/[sessionId]/page.tsx]
       |
       | ProcessMessage()
       v
[client/app/api/analyze/route.ts]
       |
       | generateObject() + AppendOntology()
       v
[client/lib/session-router.ts]
       |
       | Redis HSET/RPUSH
       v
[Redis]
  - session:{id}:meta (Hash)
  - session:{id}:nodes (Hash - nodeId -> JSON)
  - session:{id}:links (List - JSON array)
```

#### 기존 Redis 키 구조
```
sessions:list                    # Sorted Set (timestamp)
session:{sessionId}:meta         # Hash (sessionId, topic, createdAt, updatedAt, status)
session:{sessionId}:nodes        # Hash (nodeId -> JSON)
session:{sessionId}:links        # List (JSON[])
ontology:nodes                   # Set (global node names)
```

### 2.3 핵심 문제 분석

기존 시스템의 한계:
1. **노드 병합 전략**: 기존 `AppendOntology()`는 같은 이름의 노드를 병합 (val 증가)
2. **시간 정보 없음**: 각 analyze 결과에 타임스탬프가 없어 층위 구분 불가
3. **링크 중복**: 기존 링크 저장은 단순 RPUSH로 중복 관리 없음

## 3. Proposed Solution

### 3.1 Approach

완전히 새로운 API와 페이지를 생성하여 기존 visualize와 완전 분리합니다.

핵심 설계 원칙:
1. **층위(Layer) 개념 도입**: 각 analyze 결과를 독립된 층으로 저장
2. **시간 기반 정렬**: 각 층에 타임스탬프 부여
3. **Top-view 시각화**: CSS 3D Transform을 활용한 층간 이동 효과
4. **독립된 Redis 키 스페이스**: 기존 데이터와 충돌 방지

### 3.2 Technical Design

#### 3.2.1 새로운 Redis 키 구조

```
layered-sessions:list                              # Sorted Set (timestamp)
layered-session:{sessionId}:meta                   # Hash (sessionId, topic, createdAt, updatedAt, status)
layered-session:{sessionId}:layers                 # Sorted Set (layerId by timestamp)
layered-session:{sessionId}:layer:{layerId}:nodes  # Hash (nodeId -> JSON)
layered-session:{sessionId}:layer:{layerId}:links  # List (JSON[])
layered-session:{sessionId}:layer:{layerId}:meta   # Hash (timestamp, agentType, originalText)
```

#### 3.2.2 데이터 타입 정의

```typescript
// Layer 관련 타입
interface LayerMeta {
    layerId: string;
    timestamp: number;
    agentType?: string;
    originalText?: string;
}

interface LayerData {
    meta: LayerMeta;
    nodes: GraphNode[];
    links: GraphLink[];
}

interface LayeredSessionConfig {
    sessionId: string;
    topic?: string;
    createdAt: number;
    updatedAt: number;
    status: 'active' | 'completed';
    layerCount: number;
}

interface LayeredOntologyData {
    layers: LayerData[];
}
```

#### 3.2.3 API 엔드포인트 설계

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/layered-sessions` | 층위 세션 목록 조회 |
| POST | `/api/layered-sessions` | 새 층위 세션 생성 |
| GET | `/api/layered-sessions/[sessionId]` | 세션 상세 + 모든 층 조회 |
| DELETE | `/api/layered-sessions/[sessionId]` | 세션 삭제 |
| POST | `/api/layered-analyze` | 새 층 생성 및 온톨로지 분석 |

#### 3.2.4 UI 컴포넌트 구조

```
LayeredViewPage
├── LayeredGraph (메인 그래프 영역 - 80% 너비)
│   ├── CSS 3D Transform으로 층 표현
│   ├── 현재 활성 층 하이라이트
│   └── 층간 전환 애니메이션
│
└── TimelineNavigator (우측 타임라인 - 20% 너비)
    ├── 수직 타임라인 바
    ├── 각 층 노드 (클릭 가능)
    ├── 현재 층 인디케이터
    └── 자동 스크롤 (새 층 추가 시)
```

#### 3.2.5 층간 이동 애니메이션

Top-view 관점에서 층간 이동 효과:
```css
.layer-container {
    transform-style: preserve-3d;
    perspective: 1000px;
}

.layer {
    transform: translateZ(calc(var(--layer-index) * -100px))
               rotateX(60deg);
    transition: transform 0.5s ease-in-out;
}

.layer.active {
    transform: translateZ(0) rotateX(0deg);
}
```

### 3.3 File Changes Summary

#### 신규 생성 파일 (8개)

1. **`client/app/layered-view/page.tsx`**
   - 세션 생성 후 리다이렉트 로직
   - 기존 `visualize/page.tsx` 패턴 참조

2. **`client/app/layered-view/[sessionId]/page.tsx`**
   - 층위 기반 메인 뷰어 페이지
   - WebSocket 연동, 층 관리, 타임라인 통합

3. **`client/app/api/layered-sessions/route.ts`**
   - GET: 층위 세션 목록
   - POST: 새 층위 세션 생성

4. **`client/app/api/layered-sessions/[sessionId]/route.ts`**
   - GET: 세션 상세 + 모든 층 데이터
   - DELETE: 세션 삭제

5. **`client/app/api/layered-analyze/route.ts`**
   - POST: 텍스트 분석 후 새 층으로 저장
   - AI 분석 로직 (기존 analyze 참조)

6. **`client/lib/layered-session-router.ts`**
   - LayeredSessionRouter 클래스
   - 층위 기반 Redis CRUD 메서드

7. **`client/components/timeline-navigator.tsx`**
   - TimelineNavigator 컴포넌트
   - 층 선택, 네비게이션 UI

8. **`client/components/layered-graph.tsx`**
   - LayeredGraph 컴포넌트
   - 3D 층 시각화, 애니메이션

## 4. Implementation Steps

### Step 1: LayeredSessionRouter 라이브러리 구현
- **Description**: 층위 기반 세션 관리를 위한 Redis 라이브러리 구현
- **Files involved**:
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/lib/layered-session-router.ts`
- **Expected outcome**:
  - 새로운 Redis 키 구조 지원
  - CreateSession, GetSession, ListSessions 메서드
  - CreateLayer, GetLayer, GetAllLayers 메서드
  - SaveLayerOntology, DeleteSession 메서드

### Step 2: 층위 세션 API 엔드포인트 구현
- **Description**: 층위 세션 CRUD API 라우트 생성
- **Files involved**:
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/layered-sessions/route.ts`
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/layered-sessions/[sessionId]/route.ts`
- **Expected outcome**:
  - 세션 목록 조회 API
  - 세션 생성/삭제 API
  - 세션 상세 + 모든 층 조회 API

### Step 3: 층위 분석 API 구현
- **Description**: 텍스트를 분석하여 새 층으로 저장하는 API
- **Files involved**:
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/layered-analyze/route.ts`
- **Expected outcome**:
  - AI 기반 온톨로지 추출 (기존 로직 재사용)
  - 새 층 생성 및 저장
  - layerId 반환

### Step 4: TimelineNavigator 컴포넌트 구현
- **Description**: 우측 타임라인 네비게이션 UI 컴포넌트
- **Files involved**:
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/components/timeline-navigator.tsx`
- **Expected outcome**:
  - 수직 타임라인 UI
  - 층 클릭 이벤트 핸들링
  - 현재 층 하이라이트
  - 에이전트 타입별 색상 표시

### Step 5: LayeredGraph 컴포넌트 구현
- **Description**: 층위 기반 그래프 시각화 컴포넌트
- **Files involved**:
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/components/layered-graph.tsx`
- **Expected outcome**:
  - CSS 3D Transform 기반 층 표현
  - 층간 전환 애니메이션
  - 선택된 층의 노드/링크 렌더링
  - react-force-graph-2d 활용 (또는 대안)

### Step 6: 메인 뷰어 페이지 구현
- **Description**: 층위 뷰어 메인 페이지 및 라우팅
- **Files involved**:
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/layered-view/page.tsx`
  - `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/layered-view/[sessionId]/page.tsx`
- **Expected outcome**:
  - 세션 생성 후 리다이렉트
  - WebSocket 연결 및 메시지 처리
  - 층 추가 시 실시간 업데이트
  - TimelineNavigator + LayeredGraph 통합

### Step 7: 통합 테스트 및 스타일 조정
- **Description**: 전체 기능 통합 테스트 및 UI 다듬기
- **Files involved**: 모든 신규 파일
- **Expected outcome**:
  - 실시간 층 추가 동작 확인
  - 층간 이동 애니메이션 확인
  - 반응형 레이아웃 확인

## 5. Testing Strategy

### 5.1 Unit Tests
- `LayeredSessionRouter` 각 메서드 단위 테스트
  - CreateSession 성공/실패
  - CreateLayer 성공/실패
  - GetAllLayers 정렬 순서 확인
  - DeleteSession 시 모든 층 삭제 확인

### 5.2 Integration Tests
- API 엔드포인트 통합 테스트
  - POST /api/layered-sessions -> 세션 생성
  - POST /api/layered-analyze -> 층 생성
  - GET /api/layered-sessions/[id] -> 층 포함 조회
  - DELETE /api/layered-sessions/[id] -> 완전 삭제

### 5.3 Manual Testing Checklist
- [ ] `/layered-view` 접속 시 새 세션 생성 및 리다이렉트 확인
- [ ] WebSocket 연결 후 에이전트 메시지 수신 시 층 추가 확인
- [ ] 타임라인에서 층 클릭 시 해당 층으로 이동 확인
- [ ] 층간 이동 애니메이션 자연스럽게 동작 확인
- [ ] 각 층의 노드/링크가 독립적으로 표시 확인
- [ ] 새 층 추가 시 타임라인 자동 업데이트 확인
- [ ] 페이지 새로고침 후 기존 데이터 로드 확인
- [ ] Redis 연결 불가 시 Graceful Degradation 확인

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSS 3D Transform 브라우저 호환성 | Medium | Medium | Fallback 2D 모드 제공, 주요 브라우저 테스트 |
| 층 개수 증가 시 성능 저하 | High | High | 가상화(Virtualization) 적용, 층 개수 제한 옵션 |
| Redis 키 충돌 | Low | High | 완전히 분리된 키 네임스페이스 사용 |
| react-force-graph-2d와 3D Transform 충돌 | Medium | Medium | 캔버스 기반 그래프는 층 전환 시만 활성화 |
| WebSocket 메시지 순서 불일치 | Low | Medium | 메시지에 시퀀스 번호 또는 타임스탬프 활용 |

## 7. Dependencies

### 7.1 기존 의존성 (변경 없음)
- `react-force-graph-2d`: 그래프 시각화
- `ioredis`: Redis 클라이언트
- `@ai-sdk/openai`: AI 분석
- `zod`: 스키마 검증

### 7.2 추가 고려 의존성
- 없음 (기존 의존성으로 충분)

### 7.3 외부 시스템 의존성
- Redis 서버 (필수)
- OpenAI API (analyze 기능)
- Backend WebSocket 서버 (실시간 통신)

## 8. Rollback Plan

1. **코드 롤백**
   - 모든 신규 파일은 독립적이므로 디렉토리 삭제로 롤백 가능
   - `client/app/layered-view/` 삭제
   - `client/app/api/layered-sessions/` 삭제
   - `client/app/api/layered-analyze/` 삭제
   - `client/lib/layered-session-router.ts` 삭제
   - `client/components/timeline-navigator.tsx` 삭제
   - `client/components/layered-graph.tsx` 삭제

2. **Redis 데이터 정리**
   ```bash
   redis-cli KEYS "layered-*" | xargs redis-cli DEL
   ```

3. **기존 시스템 영향 없음**
   - 기존 visualize 페이지는 별도 경로이므로 영향 없음
   - 기존 session API는 변경 없으므로 영향 없음

## 9. Notes and Recommendations

### 9.1 파일명 규칙 준수
- 모든 파일명은 kebab-case 사용: `layered-session-router.ts`, `timeline-navigator.tsx`
- 함수명은 PascalCase 사용: `CreateSession`, `GetAllLayers`
- Hook은 camelCase 사용: `useLayerNavigation`, `useWebSocketConnection`

### 9.2 성능 최적화 권장사항
1. **층 개수 제한**: 초기 버전은 최대 50개 층으로 제한 권장
2. **Lazy Loading**: 현재 활성 층 + 인접 2개 층만 노드 데이터 로드
3. **메모이제이션**: `useMemo`, `useCallback`으로 불필요한 리렌더링 방지

### 9.3 향후 확장 고려사항
1. **층간 연결 시각화**: 같은 이름의 노드가 다른 층에 있을 때 연결선 표시
2. **층 필터링**: 특정 에이전트의 층만 표시
3. **층 비교 모드**: 2개 층을 나란히 비교
4. **Export 기능**: 전체 층 데이터를 JSON으로 내보내기

### 9.4 기존 코드 참조 포인트

| 기능 | 참조 파일 | 참조 위치 |
|------|-----------|-----------|
| Redis 연결 패턴 | `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/lib/redis.ts` | 전체 |
| 세션 관리 패턴 | `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/lib/session-router.ts` | SessionRouter 클래스 |
| API 라우트 패턴 | `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/sessions/[sessionId]/route.ts` | 전체 |
| WebSocket 처리 | `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/visualize/[sessionId]/page.tsx` | Line 137-184 |
| AI 분석 호출 | `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/analyze/route.ts` | 전체 |
| Force Graph 사용 | `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/visualize/[sessionId]/page.tsx` | Line 321-415 |

### 9.5 주요 구현 상세 노트

#### LayeredSessionRouter 핵심 메서드

```typescript
// 구현해야 할 주요 메서드 시그니처
class LayeredSessionRouter {
    // 세션 관리
    static GenerateSessionId(): string;
    static GenerateLayerId(): string;
    static CreateSession(topic?: string): Promise<LayeredSessionConfig | null>;
    static GetSession(sessionId: string): Promise<LayeredSessionConfig | null>;
    static ListSessions(limit?: number): Promise<LayeredSessionConfig[]>;
    static DeleteSession(sessionId: string): Promise<boolean>;

    // 층 관리
    static CreateLayer(sessionId: string, meta: Partial<LayerMeta>): Promise<LayerMeta | null>;
    static SaveLayerOntology(sessionId: string, layerId: string, data: OntologyData): Promise<boolean>;
    static GetLayer(sessionId: string, layerId: string): Promise<LayerData | null>;
    static GetAllLayers(sessionId: string): Promise<LayerData[]>;
}
```

#### 타임라인 UI 요구사항

- 화면 우측 끝에 고정 (fixed position 또는 flex layout)
- 세로 방향 스크롤 가능
- 각 층은 원형 또는 사각형 노드로 표현
- 클릭 시 해당 층으로 부드럽게 이동
- 현재 활성 층은 하이라이트 (테두리 또는 배경색)
- 에이전트 타입별 색상 구분 (FRITZ, BOB 등)

#### 3D 층 시각화 핵심 CSS

```css
/* Top-view 관점의 층 시각화를 위한 핵심 스타일 */
.layers-container {
    perspective: 1000px;
    perspective-origin: center 20%;
}

.layer {
    position: absolute;
    transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.4s ease;
}

.layer:not(.active) {
    opacity: 0.3;
    pointer-events: none;
}
```
