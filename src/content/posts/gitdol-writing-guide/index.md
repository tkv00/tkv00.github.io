---
title: 깃돌에 글 쓰는 법
description: 이미지는 끌어다 놓고, 미리보기는 옆에 띄워두고, 주석은 알아서 예뻐집니다.
date: '2026-08-25'
category: 메모
tags:
  - 블로그
  - 마크다운
  - 사용법
draft: true
---

티스토리에서 넘어오면서 제일 걱정한 건 두 가지였습니다.
글을 쓰면서 결과를 못 본다는 것, 그리고 이미지를 넣을 때마다 경로를 손으로 맞춰야 한다는 것.
둘 다 없앴습니다.

## 글 하나 = 폴더 하나

글은 폴더 하나에 통째로 들어갑니다. 이미지도 그 안에 같이 둡니다.

```text title="src/content/posts/"
llm-assisted-test-1/
  index.md          ← 글
  pit-score.png     ← 이미지를 그냥 옆에 둔다
  flow.png
```

본문에서는 이렇게 씁니다.

```markdown
![PIT 뮤테이션 점수 비교](./pit-score.png)
```

`/assets/2026/08/...` 같은 경로를 만들 일도, `public/` 에 복사할 일도 없습니다.
빌드할 때 알아서 최적화하고, 해시 붙은 주소로 바꾸고, 크기별로 여러 벌 만들어 둡니다.
글 폴더를 통째로 옮겨도 이미지가 같이 따라옵니다.

## 로컬 글쓰기 화면

```bash
npm run dev
```

실행한 뒤 브라우저에서 `http://localhost:4321/admin`을 엽니다.
로그인도, 토큰도, 폴더 선택도 필요하지 않습니다. 이 화면은 로컬 개발 서버에서만 파일을 읽고 쓸 수 있습니다.

왼쪽에서 글을 고르면 가운데에서 내용을 쓰고, 오른쪽에는 실제 블로그 화면이 뜹니다.
입력을 멈추면 `src/content/posts/<글 경로>/index.md`에 자동 저장되고 미리보기도 갱신됩니다.
새 글은 실수로 바로 공개되지 않도록 `draft: true`인 초안으로 만들어집니다.

이미지는 본문 칸에 끌어다 놓거나 붙여 넣으면 됩니다. 이미지 파일은 현재 글의 폴더에 저장되고 아래 Markdown도 자동으로 들어갑니다.

```markdown
![이미지 설명](./image.png)
```

## 링크는 북마크 카드가 됩니다

외부 링크를 한 줄에 단독으로 놓으면 제목과 도메인이 들어간 북마크 카드로 표시됩니다.

```markdown
[카카오페이 여신코어 DDD로 구축하기](https://tech.kakaopay.com/post/backend-domain-driven-design/)
```

문장 안에 넣은 [일반 링크](https://example.com)는 지금처럼 밑줄 링크로 남습니다.
티스토리에서 넘어온 제목·설명·도메인 형식은 자동으로 복구하고, 같은 주소가 두 번 들어온 경우 정보가 풍부한 카드 하나만 보여줍니다.

## 주석은 그냥 쓰면 예뻐집니다

코드 블록 안의 주석은 자동으로 다르게 그려집니다.
평소엔 조용히 있다가, 코드 블록에 마우스를 올리면 또렷해집니다.

```java title="ChurnRateTest.java"
// LLM이 준 것 — 구현을 그대로 옮겼다
@Test
void 이탈률_계산() {
  var r = svc.churn(100, 12);
  assertThat(r).isEqualTo(12 / (double) 100);   // 구현을 다시 쓴 것에 불과하다
}

// [!포인트] 구현이 아니라 '지켜야 할 성질'을 물어봐야 한다
@Test
void 이탈률은_0과_1_사이여야_한다() {
  var r = svc.churn(total, left);
  assertThat(r).isBetween(0d, 1d);
}
```

주석 앞에 표식을 붙이면 아예 상자로 튀어나옵니다. 네 가지가 있습니다.

```python title="pipeline.py"
# [!포인트] 여기가 이 글에서 제일 중요한 줄이다
score = mutation_score(module)

# [!주의] 전체 모듈에 돌리면 CI가 20분을 넘긴다
if score < THRESHOLD:
    fail("뮤테이션 점수가 기준 아래입니다")

# [!팁] 변경된 파일이 속한 모듈만 골라 돌리면 2~4분이면 끝난다
targets = changed_modules(diff)

# [!참고] 야간 스케줄로 전체를 한 번 더 돌린다
nightly(targets=ALL)
```

한글도 영어도 됩니다. `[!포인트]` `[!point]` `[!핵심]` 은 같은 것이고,
`주의/warn/경고`, `팁/tip`, `참고/note/메모` 도 마찬가지입니다.

## 글 머리에 적는 것들

```yaml title="index.md 맨 위"
---
title: LLM이 짠 테스트 코드를 그대로 믿습니까?
description: 검색 결과와 공유 카드에 뜨는 한 줄. 비워두면 본문에서 알아서 뽑는다.
date: 2026-05-29
project: TR1L        # 사이드바 '프로젝트'에 묶인다
tags: [testing, llm, junit]
draft: false         # true 면 개발 중에만 보이고 발행되지 않는다
---
```

`project` 대신 `category` 를 쓰면 사이드바 '카테고리' 쪽에 묶입니다.
`description` 을 비워두면 본문 첫 문단을 잘라서 씁니다. 그래도 되지만, 직접 쓰는 쪽이 검색에 유리합니다.

## 발행

글을 다 썼다면 글 설정에서 **초안으로 보관** 체크를 끄고 저장합니다. 로컬 편집기는 파일까지만 저장하며 Git 커밋과 푸시는 자동으로 하지 않습니다.

```bash
git add .
git commit -m "새 글"
git push
```

푸시하면 GitHub Actions가 알아서 빌드하고 배포합니다. 대략 2~3분 뒤에 올라옵니다.

> 글을 쓰는 데 쓰는 시간이 글을 나르는 데 쓰는 시간보다 길어야 합니다.
> 이 블로그는 그러라고 만들었습니다.
