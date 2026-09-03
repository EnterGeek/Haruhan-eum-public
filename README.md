# 하루한음 Public Baseline

[![CI](https://github.com/EnterGeek/Haruhan-eum-public/actions/workflows/ci.yml/badge.svg)](https://github.com/EnterGeek/Haruhan-eum-public/actions/workflows/ci.yml)
[![CodeQL](https://github.com/EnterGeek/Haruhan-eum-public/actions/workflows/codeql.yml/badge.svg)](https://github.com/EnterGeek/Haruhan-eum-public/actions/workflows/codeql.yml)

하루한음의 공개 연구·개발 기준선입니다. 사용자는 오늘을 잠깐 떠올린 뒤 12개의 색에 가볍게 반응하고, 그 선택 흐름으로 짧은 멜로디를 만납니다.

사용자가 색–음 대응을 기억하거나 자신의 심리를 해석할 필요는 없습니다. 이 저장소의 알고리즘은 **감정·성격·정신건강을 진단하지 않으며**, 색 선택을 음악 생성에 사용할 수 있는 관찰 가능한 신호로만 다룹니다.

## 현재 상태

- **Work 01:** 결정적 OKLCH 색상 덱, 좌우 선택, 되돌리기, 세션 JSON 계약
- **Work 02:** 입력 adapter, Hue 해석 A/B/C, melody generator baseline, Web Audio schedule/player
- **Work 03 R&D:** 결정적 phrase/motif/rhythm/cadence grammar v1, 구조 metric, Work 02 비교 report
- **개발용 Lab:** `/work02-lab.html`, `/work02-color-dimensions-lab.html`, `/work03-lab.html`
- **제품 기본 매핑:** 미확정
- **개인화·잠재 상태 추정·production mapping:** 이 공개 저장소의 범위 밖

모든 Work 02·03 음악 규칙은 현재 **실험 가정**입니다. 색채 심리 검사나 의료·상담 도구로 사용해서는 안 됩니다. Work 03은 production UI 또는 Work 02 기본 동작을 대체하지 않습니다.

## 실행

```bash
npm ci
npm run dev
```

검증:

```bash
npm test
npm run build
npm run report:work03
```

## 진입점

| 경로 | 용도 |
|---|---|
| `/` | Work 01 모바일 색 선택 프로토타입 |
| `/work02-lab.html` | Absolute / Relative / Hybrid Hue 비교 |
| `/work02-color-dimensions-lab.html` | Hue-only와 Hue + Lightness + Chroma 임시 비교 |
| `/work03-lab.html` | 공개 fixture 기반 Work 02 baseline과 Music Grammar v1 구조 비교 |

Lab은 제품 화면이 아니라 개발·비교 도구입니다. Work 02 lab에는 브라우저 청취가 있지만, Work 03 lab은 정직한 Work 03 schedule 검증까지만 제공하고 playback은 연결하지 않습니다. Lab 결과가 심리적 의미나 제품 기본 알고리즘의 확정을 뜻하지 않습니다.

Work 03 전체 비교 harness는 16개 공개 fixture × 3개 해석 방식 × 6개 profile을 평가합니다. 현재 구조 가설 결과는 H1–H6 통과, H7 contour/register 가설 실패로 `MIXED`이며 production 교체 권고는 `NO`입니다. 자세한 계약과 결과는 [`docs/work03/STRUCTURAL_EVALUATION_V1.md`](docs/work03/STRUCTURAL_EVALUATION_V1.md)와 [`docs/work03/STRUCTURAL_COMPARISON_REPORT_V1.md`](docs/work03/STRUCTURAL_COMPARISON_REPORT_V1.md)를 참조하세요.

## 데이터와 개인정보

저장소에 포함된 회귀 fixture는 공개용으로 정리한 **합성 데이터**입니다.

- 실제 사용자 세션, 이름, 계정 ID, 실제 시각·시간대는 commit하지 않습니다.
- fixture는 알고리즘 회귀에 필요한 색·방향·입력 패턴만 보존합니다.
- 실제 사용자 연구 데이터와 production inference는 별도 비공개 경계에서 관리합니다.

자세한 원칙은 다음 문서를 참조하세요.

- [`docs/PUBLIC_PRIVATE_BOUNDARY.md`](docs/PUBLIC_PRIVATE_BOUNDARY.md)
- [`docs/EXPERIMENTAL_USE_POLICY.md`](docs/EXPERIMENTAL_USE_POLICY.md)
- [`docs/golden-sessions/README.md`](docs/golden-sessions/README.md)
- [`WORK_02_IMPLEMENTATION_ASSUMPTIONS.md`](WORK_02_IMPLEMENTATION_ASSUMPTIONS.md)

## 자동 검사

- push / pull request: Node 22·24에서 test 및 build
- 매일: 10,000-seed deck stress test
- 매주: dependency audit
- push / pull request / 주간: CodeQL JavaScript·TypeScript 분석

## 공개·비공개 경계

공개 저장소에는 재현 가능한 입력 계약, baseline generator, synthetic fixture와 검증 도구를 둡니다. 개인화 모델, 사용자 연구 결과, 잠재 음악 상태 추정, production mapping 및 비공개 평가 정책은 `Haruhan-eum-engine-private`에서 관리합니다.

## 라이선스

현재 오픈소스 라이선스가 부여되어 있지 않습니다. 저장소가 공개되어 있다는 사실만으로 코드의 사용·수정·재배포 권한이 부여되지는 않습니다.
