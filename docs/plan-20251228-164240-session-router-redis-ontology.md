# Development Plan: Session Router and Redis Ontology Storage

## Meta Information
- **Created**: 2025-12-28 16:42:40
- **Type**: Feature Development
- **Priority**: High
- **Estimated Complexity**: Moderate

## 1. Overview

WebSocket 데이터 수신 시 세션 라우터를 통해 라우팅을 처리하고, 온톨로지 분석 결과를 Redis에 저장하여 영속성을 확보하는 기능을 개발합니다. 이를 통해 토론 세션별로 온톨로지 데이터를 관리하고, 이후에도 저장된 데이터를 조회할 수 있도록 합니다.

### 핵심 목표
1. **세션 라우터 구현**: WebSocket 연결 시 세션 ID 기반 라우팅 처리
2. **Redis 온톨로지 저장**: 분석된 온톨로지 데이터(노드, 링크)를 Redis에 영속적으로 저장
3. **세션별 데이터 조회**: 저장된 세션 데이터를 이후에도 조회할 수 있는 API 제공

## 2. Current State Analysis

### 2.1 Relevant Files

| File | Purpose | Modification Type |
|------|---------|-------------------|
| `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/visualize/page.tsx` | WebSocket 연결 및 온톨로지 시각화 | Modify |
| `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/analyze/route.ts` | 온톨로지 분석 API 엔드포인트 | Modify |
| `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/lib/redis.ts` | Redis 클라이언트 설정 | Modify |
| `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/lib/session-router.ts` | 세션 라우터 모듈 | Create |
| `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/sessions/route.ts` | 세션 목록 조회 API | Create |
| `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/client/app/api/sessions/[sessionId]/route.ts` | 특정 세션 데이터 조회 API | Create |
| `/Users/sewonist/Projects/07.wgwg/05.Projects/wgwg/backend/main.py` | 백엔드 WebSocket 서버 (세션 ID 전송) | Modify |

### 2.2 Current Architecture

#### 현재 데이터 흐름
```
[WebSocket (backend/main.py)]
    |
    v
[visualize/page.tsx] --> WebSocket 메시지 수신
    |
    v
[/api/analyze] --> 온톨로지 분석 (GPT)
    |
    v
[Redis] --> 노드 이름만 저장 (ontology:nodes Set)
    |
    v
[ForceGraph2D] --> 그래프 시각화
```

#### 현재 Redis 저장 구조
- `ontology:nodes`: Set 타입, 노드 이름만 저장
- 세션 정보 없음, 링크 정보 저장 안 함
- 그래프 전체 데이터 영속성 없음

#### 현재 코드 분석

**`/client/app/api/analyze/route.ts`**:
- 기존 노드 목록을 Redis에서 조회하여 GPT 프롬프트에 컨텍스트로 제공
- 분석 후 노드 이름만 `ontology:nodes` Set에 저장
- 링크 정보 및 세션 정보는 저장하지 않음

**`/client/lib/redis.ts`**:
- ioredis 기반 싱글톤 Redis 클라이언트
- 연결 오류 시 자동으로 Redis 비활성화 처리
- `checkRedisAvailable()` 함수로 가용성 확인

**`/client/app/visualize/page.tsx`**:
- WebSocket으로 `ws://localhost:4001/ws/chat` 연결
- agentType 변경 시 메시지 버퍼를 `/api/analyze`로 전송
- 분석 결과를 로컬 state에만 저장 (새로고침 시 소실)

### 2.3 Identified Issues

1. **세션 개념 부재**: 현재 모든 데이터가 단일 키(`ontology:nodes`)에 저장되어 세션 구분 불가
2. **불완전한 데이터 저장**: 노드 이름만 저장하고 전체 노드 정보(type, description) 및 링크 정보 미저장
3. **영속성 부재**: 그래프 데이터가 클라이언트 state에만 존재하여 새로고침 시 소실
4. **세션 라우터 부재**: WebSocket 연결에 세션 기반 라우팅 로직 없음

## 3. Proposed Solution

### 3.1 Approach

1. **세션 ID 생성 및 관리**: UUID 기반 세션 ID를 생성하고 WebSocket 연결 시 전달
2. **Redis 데이터 구조 재설계**: 세션별 온톨로지 데이터를 체계적으로 저장
3. **세션 라우터 모듈 구현**: 세션 ID 기반 라우팅 및 데이터 관리 로직 분리
4. **API 엔드포인트 추가**: 세션 목록 및 개별 세션 데이터 조회 API 구현

### 3.2 Technical Design

#### 3.2.1 Redis 데이터 구조 설계

```
# 세션 목록 (Sorted Set - score는 생성 timestamp)
sessions:list                     -> ZADD sessions:list <timestamp> <sessionId>

# 세션 메타데이터 (Hash)
session:{sessionId}:meta          -> HSET session:{sessionId}:meta
                                      createdAt <timestamp>
                                      updatedAt <timestamp>
                                      topic <topic>
                                      status <active|completed>

# 온톨로지 노드 (Hash of JSON)
session:{sessionId}:nodes         -> HSET session:{sessionId}:nodes <nodeId> <nodeJSON>

# 온톨로지 링크 (List of JSON)
session:{sessionId}:links         -> RPUSH session:{sessionId}:links <linkJSON>

# 전역 노드 인덱스 (기존 유지, 모든 세션의 노드 이름 통합)
ontology:nodes                    -> SADD ontology:nodes <nodeName>

# 채팅 메시지 히스토리 (List)
session:{sessionId}:messages      -> RPUSH session:{sessionId}:messages <messageJSON>
```

#### 3.2.2 세션 라우터 모듈 설계

```typescript
// /client/lib/session-router.ts

interface SessionConfig {
  sessionId: string;
  topic?: string;
  createdAt: number;
}

interface OntologyData {
  nodes: GraphNode[];
  links: GraphLink[];
}

class SessionRouter {
  // 세션 생성
  static CreateSession(topic?: string): Promise<SessionConfig>

  // 세션 조회
  static GetSession(sessionId: string): Promise<SessionConfig | null>

  // 온톨로지 데이터 저장
  static SaveOntology(sessionId: string, data: OntologyData): Promise<void>

  // 온톨로지 데이터 조회
  static GetOntology(sessionId: string): Promise<OntologyData>

  // 메시지 저장
  static SaveMessage(sessionId: string, message: ChatMessage): Promise<void>

  // 세션 목록 조회
  static ListSessions(limit?: number): Promise<SessionConfig[]>
}
```

#### 3.2.3 API 엔드포인트 설계

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | 세션 목록 조회 (최근 순 정렬) |
| `/api/sessions` | POST | 새 세션 생성 |
| `/api/sessions/[sessionId]` | GET | 특정 세션의 온톨로지 데이터 조회 |
| `/api/sessions/[sessionId]` | DELETE | 세션 삭제 |
| `/api/analyze` | POST | 기존 API 확장 (sessionId 파라미터 추가) |

#### 3.2.4 프론트엔드 수정 사항

1. **세션 초기화**: 페이지 로드 시 새 세션 생성 또는 기존 세션 복원
2. **동적 라우팅**: `/visualize/[sessionId]` 형태로 세션 공유 가능 (Next.js dynamic route)
3. **세션 목록 UI**: 사이드바 또는 드롭다운으로 이전 세션 목록 표시
4. **데이터 복원**: 세션 선택 시 Redis에서 온톨로지 데이터 로드

#### 3.2.5 라우팅 구조

```
/visualize              → 새 세션 생성 후 /visualize/{newSessionId}로 리다이렉트
/visualize/{sessionId}  → 기존 세션 로드 및 시각화
```

**파일 구조**:
```
client/app/visualize/
├── page.tsx                    # 새 세션 생성 → 리다이렉트
└── [sessionId]/
    └── page.tsx                # 세션별 시각화 페이지
```

### 3.3 File Changes Summary

| File | Change Description |
|------|-------------------|
| `client/lib/session-router.ts` | 세션 라우터 모듈 신규 생성 |
| `client/lib/redis.ts` | 세션 관련 헬퍼 함수 추가 |
| `client/app/api/analyze/route.ts` | sessionId 파라미터 처리, 전체 온톨로지 저장 로직 추가 |
| `client/app/api/sessions/route.ts` | 세션 목록/생성 API 신규 생성 |
| `client/app/api/sessions/[sessionId]/route.ts` | 개별 세션 조회/삭제 API 신규 생성 |
| `client/app/visualize/page.tsx` | 새 세션 생성 후 리다이렉트 처리 |
| `client/app/visualize/[sessionId]/page.tsx` | 세션별 시각화 페이지 (신규 생성) |
| `backend/main.py` | WebSocket 연결 시 세션 ID 응답 (선택적) |

## 4. Implementation Steps

### Step 1: 세션 라우터 모듈 생성
- **Description**: 세션 관리를 위한 핵심 모듈 구현
- **Files involved**: `/client/lib/session-router.ts`
- **Expected outcome**: 세션 생성, 조회, 데이터 저장/로드 기능 제공

### Step 2: Redis 헬퍼 함수 확장
- **Description**: redis.ts에 세션 데이터 처리를 위한 유틸리티 함수 추가
- **Files involved**: `/client/lib/redis.ts`
- **Expected outcome**: JSON 직렬화/역직렬화, 키 생성 헬퍼 등

### Step 3: 세션 API 엔드포인트 구현
- **Description**: 세션 목록 조회, 생성, 개별 세션 조회/삭제 API 구현
- **Files involved**:
  - `/client/app/api/sessions/route.ts`
  - `/client/app/api/sessions/[sessionId]/route.ts`
- **Expected outcome**: RESTful 세션 관리 API 완성

### Step 4: 온톨로지 분석 API 수정
- **Description**: 기존 analyze API에 세션 ID 지원 및 전체 데이터 저장 로직 추가
- **Files involved**: `/client/app/api/analyze/route.ts`
- **Expected outcome**: 세션별 온톨로지 데이터 영속적 저장

### Step 5: Visualize 페이지 수정 (동적 라우팅)
- **Description**: `/visualize/[sessionId]` 동적 라우팅 구현 및 세션 데이터 복원 로직
- **Files involved**:
  - `/client/app/visualize/page.tsx` (리다이렉트 로직)
  - `/client/app/visualize/[sessionId]/page.tsx` (시각화 페이지 - 신규 생성)
- **Expected outcome**:
  - `/visualize` 접근 시 새 세션 생성 후 `/visualize/{sessionId}`로 리다이렉트
  - `/visualize/{sessionId}` 접근 시 해당 세션 데이터 로드 및 시각화
  - 이전 세션 목록 표시 및 전환 기능

### Step 6: 백엔드 세션 연동 (선택적)
- **Description**: WebSocket 연결 시 세션 ID 교환
- **Files involved**: `/backend/main.py`
- **Expected outcome**: 백엔드와 프론트엔드 간 세션 동기화

## 5. Testing Strategy

### 5.1 Unit Tests

- **세션 라우터 테스트**
  - CreateSession(): 유효한 세션 ID 생성 확인
  - SaveOntology(): 노드/링크 정확한 저장 확인
  - GetOntology(): 저장된 데이터 정확한 복원 확인
  - ListSessions(): 최근 순 정렬 확인

- **Redis 헬퍼 테스트**
  - JSON 직렬화/역직렬화 정확성
  - 키 네이밍 규칙 준수 확인

### 5.2 Integration Tests

- **API 엔드포인트 테스트**
  - POST /api/sessions: 세션 생성 및 ID 반환
  - GET /api/sessions: 세션 목록 페이지네이션
  - GET /api/sessions/[id]: 온톨로지 데이터 반환
  - DELETE /api/sessions/[id]: 세션 및 관련 데이터 삭제

- **End-to-End 테스트**
  - WebSocket 메시지 수신 -> 분석 -> Redis 저장 -> 페이지 새로고침 -> 데이터 복원

### 5.3 Manual Testing Checklist

- [ ] 새 세션 생성 시 고유한 세션 ID가 URL에 반영되는지 확인
- [ ] 여러 메시지 분석 후 Redis에 노드/링크가 누적 저장되는지 확인
- [ ] 페이지 새로고침 후 그래프 데이터가 복원되는지 확인
- [ ] URL의 세션 ID로 다른 브라우저에서 같은 세션 접근 가능한지 확인
- [ ] 세션 목록에서 이전 세션 선택 시 데이터 로드 확인
- [ ] Redis 미가용 시 그레이스풀 폴백 동작 확인
- [ ] 동시에 여러 클라이언트가 같은 세션 접근 시 데이터 일관성 확인

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Redis 연결 실패 | Medium | High | checkRedisAvailable() 활용, 로컬 스토리지 폴백 구현 |
| 세션 데이터 대량 누적 | Medium | Medium | 오래된 세션 자동 삭제 정책 (TTL 또는 스케줄러) |
| 동시성 문제 | Low | Medium | Redis atomic operations 활용 (MULTI/EXEC 또는 Lua script) |
| 노드 ID 충돌 | Low | Medium | UUID 기반 ID 생성으로 충돌 방지 |
| 성능 저하 (대량 노드/링크) | Low | High | 페이지네이션, 레이지 로딩 구현 |

## 7. Dependencies

### 기술적 의존성
- **ioredis**: 이미 설치됨 (v5.8.2)
- **zod**: API 스키마 검증에 활용 (이미 설치됨)
- **uuid**: 세션 ID 생성 (신규 설치 필요 또는 crypto.randomUUID() 활용)

### 환경 의존성
- **Redis 서버**: 로컬 또는 원격 Redis 인스턴스 필요
- **환경 변수**: REDIS_URL 또는 REDIS_HOST/PORT/PASSWORD

### API 의존성
- 기존 `/api/analyze` API의 응답 스키마 유지 필요 (하위 호환성)

## 8. Rollback Plan

### 롤백 시나리오
1. **문제 발생**: Redis 저장 로직 오류 또는 성능 이슈
2. **롤백 절차**:
   - analyze/route.ts에서 세션 저장 로직 비활성화 (주석 처리)
   - visualize/page.tsx에서 세션 복원 로직 비활성화
   - 기존 로컬 state 기반 동작으로 복귀
3. **데이터 처리**: 기존 Redis 데이터는 유지, 신규 저장만 중단

### 안전한 배포 전략
- Feature flag 도입 검토: `ENABLE_SESSION_ROUTER=true/false`
- 단계적 롤아웃: 먼저 analyze API 수정, 이후 프론트엔드 수정

## 9. Notes and Recommendations

### 구현 시 고려사항

1. **세션 ID 형식**: UUID v4 권장 (`crypto.randomUUID()` 또는 `uuid` 패키지)

2. **Redis 키 네이밍 규칙**:
   - 프로젝트 프리픽스: `wgwg:` (선택적)
   - 세션 데이터: `session:{sessionId}:*`
   - 글로벌 데이터: `ontology:*`

3. **데이터 만료 정책**:
   - 비활성 세션 30일 후 자동 삭제 권장
   - Redis EXPIRE 또는 배치 정리 작업

4. **프로젝트 컨벤션 준수**:
   - 파일명: kebab-case (`session-router.ts`)
   - 함수명: PascalCase (`CreateSession`, `SaveOntology`)
   - hook 함수: camelCase (`useSession`)

5. **백엔드 연동 확장**:
   - 현재 백엔드 main.py의 `configurable = {"thread_id": "1"}`를 세션 ID와 연동 가능
   - LangGraph의 MemorySaver와 세션 동기화 고려

### 향후 확장 가능성

- **세션 공유 기능**: 읽기 전용 링크 생성
- **세션 비교 기능**: 두 세션의 온톨로지 차이 시각화
- **실시간 협업**: 같은 세션에 여러 사용자 동시 참여
- **내보내기 기능**: 세션 데이터 JSON/CSV 다운로드

---

**Document Version**: 1.0
**Last Updated**: 2025-12-28 16:42:40
**Author**: Claude Code (Planning Mode)
