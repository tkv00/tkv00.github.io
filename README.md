# 깃돌

다크 우주 테마 개인 기술 블로그. Astro + GitHub Pages.

```
tkv00.github.io          블로그
tkv00.github.io/admin    글쓰기 화면
```

---

## 1. 처음 한 번만 하는 일

### 1-1. 저장소 만들기

GitHub에서 **`tkv00.github.io`** 라는 이름으로 저장소를 새로 만듭니다.
이름이 정확히 이래야 `tkv00.github.io` 주소를 씁니다.

```bash
cd gitdol-blog
git init -b main
git remote add origin https://github.com/tkv00/tkv00.github.io.git
git add .
git commit -m "블로그 시작"
git push -u origin main
```

### 1-2. Pages 켜기

저장소 → **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
`.github/workflows/deploy.yml` 이 알아서 빌드하고 올립니다. 첫 배포는 2~3분 걸립니다.

### 1-3. 댓글 켜기 (giscus)

1. 저장소 → Settings → General → Features → **Discussions** 체크
2. Discussions 탭 → **Comments** 라는 카테고리를 하나 만듭니다 (Announcement 형식 권장)
3. <https://github.com/apps/giscus> 에서 이 저장소에 giscus 앱을 설치합니다
4. <https://giscus.app> 에 저장소 주소를 넣으면 `repoId` 와 `categoryId` 가 나옵니다
5. 그 두 값을 `src/site.config.mjs` 의 `giscus` 에 붙여넣습니다

값을 안 넣으면 댓글 자리에 안내문이 대신 뜹니다. 사이트는 정상 동작합니다.

### 1-4. 방문자 수 켜기 (GoatCounter)

<https://www.goatcounter.com> 에서 무료로 가입하고 받은 코드(예: `gitdol`)를
`src/site.config.mjs` 의 `analytics.goatcounter` 에 넣습니다.
광고도 쿠키도 없고, 통계 페이지는 본인만 봅니다. 비워두면 방문자 수 표시가 사라집니다.

### 1-5. 검색엔진에 알리기

- 구글 — <https://search.google.com/search-console> 에서 `tkv00.github.io` 등록 →
  사이트맵으로 `https://tkv00.github.io/sitemap-index.xml` 제출
- 네이버 — <https://searchadvisor.naver.com> 에서 같은 방식으로 등록
- 소유확인 코드가 필요하면 `src/site.config.mjs` 의 `verification` 에 넣으면 `<head>` 에 박힙니다

---

## 2. 티스토리 글 옮기기

### 백업 파일이 있으면 (정확함)

티스토리 관리자 → **설정 → 데이터 관리 → 블로그 데이터 내보내기** 로 XML을 받고:

```bash
node scripts/migrate-tistory.mjs ~/Downloads/backup.xml --dry   # 확인만
node scripts/migrate-tistory.mjs ~/Downloads/backup.xml         # 실제로 옮기기
```

### 백업 파일이 없으면

```bash
node scripts/migrate-tistory.mjs --url https://codekim3570.tistory.com --scan 200
```

RSS와 글 번호를 훑어 본문을 긁어옵니다. 백업만큼 깔끔하진 않으니 옮긴 뒤 한 번 훑어보세요.

두 경우 모두 **이미지를 전부 내려받아 글 폴더 안에 넣고 본문 경로까지 바꿔줍니다.**
이미 있는 글은 건너뛰므로 여러 번 돌려도 안전합니다.

옮긴 뒤 `npm run dev` 로 확인하고, 카테고리가 프로젝트로 잘 잡혔는지만 봐주세요.

---

## 3. 글 쓰기

### 방법 A — 브라우저에서 (`/admin`)

`https://tkv00.github.io/admin` 으로 들어갑니다.

로그인은 **Sign In with Token** 을 누르고 GitHub 개인 토큰을 넣습니다.
토큰은 <https://github.com/settings/tokens> → Fine-grained token →
이 저장소만 선택 → **Contents: Read and write** 권한으로 만듭니다.

> **다른 사람은 저장할 수 없습니다.**
> 저장 버튼은 결국 `tkv00/tkv00.github.io` 에 커밋을 날립니다.
> 이 저장소에 쓰기 권한이 없는 계정은 GitHub이 거부합니다.
> 화면을 우회하거나 코드를 뜯어봐도 마찬가지입니다 — 검사를 화면이 아니라 GitHub이 합니다.

이미지는 편집기 안으로 **끌어다 놓으면** 글과 같은 폴더에 저장되고 경로까지 채워집니다.

### 방법 B — 내 컴퓨터에서

```bash
npm install
npm run dev      # http://localhost:4321
```

저장하는 순간 브라우저가 바뀝니다. 실제 블로그와 똑같은 화면입니다.

새 글은 폴더를 하나 만들고 `index.md` 를 넣으면 됩니다.

```
src/content/posts/
  내-글-주소/
    index.md
    사진.png        ← 그냥 옆에 둔다
```

```markdown
---
title: 글 제목
description: 검색 결과에 뜨는 한 줄. 비워두면 본문에서 뽑습니다.
date: 2026-08-25
project: TR1L          # 또는 category: 데이터베이스
tags: [testing, junit]
draft: false
---

본문. 이미지는 ![설명](./사진.png) 로 씁니다.
```

---

## 4. 주석 강조

코드 블록의 주석은 자동으로 다르게 그려집니다. 평소엔 조용하다가 코드에 마우스를 올리면 또렷해집니다.

주석 앞에 표식을 붙이면 아예 상자로 튀어나옵니다.

```java
// [!포인트] 이 글에서 제일 중요한 줄
// [!주의]   조심해야 하는 것
// [!팁]     알아두면 좋은 것
// [!참고]   곁다리 설명
```

`[!point] [!warn] [!tip] [!note]` 처럼 영어로 써도 같습니다.
`//` `#` `--` `/* */` 어느 주석 문법이든 동작합니다.

코드 블록에 파일명을 붙이려면:

````markdown
```java title="ChurnRateTest.java"
```
````

---

## 5. 배포

`main` 에 푸시하면 GitHub Actions가 알아서 빌드하고 올립니다. 2~3분 걸립니다.

```bash
git add . && git commit -m "새 글" && git push
```

`/admin` 에서 **발행**을 눌러도 같습니다 — 저장이 곧 커밋입니다.

---

## 파일이 어디 있나

```
src/
  site.config.mjs        블로그 이름·프로필·giscus·방문자수 설정 (대부분 여기만 고치면 됨)
  content/posts/         글. 폴더 하나 = 글 하나
  styles/global.css      디자인 전체
  components/
    Sidebar.astro        왼쪽 프로필 사이드바
    Sky.astro            별·별똥별·행성
    Comments.astro       giscus
    Toc.astro            목차
  lib/
    shiki-theme.mjs      코드 색상 테마
    shiki-comments.mjs   주석 강조 (핵심)
    rehype-chrome.mjs    코드 상자·제목 앵커
  pages/
    og/[...route].png.ts 공유 카드 이미지 자동 생성
public/
  admin/                 글쓰기 화면 (Sveltia CMS)
  fonts/                 Pretendard
scripts/
  migrate-tistory.mjs    티스토리 이사 도구
```

## 프로필 사진 바꾸기

지금은 `public/profile.png` (우주복 입은 고양이)를 쓰고 있습니다.
바꾸려면 그 파일을 덮어쓰거나, 새 파일을 `public/` 에 넣고
`src/site.config.mjs` 의 `author.avatar` 를 그 경로로 바꾸면 됩니다.

정사각형 이미지를 넣으면 원으로 잘립니다. 320×320 정도면 충분합니다.
사이드바와 공유 카드 두 군데에 같이 쓰입니다.
`avatar` 를 빈 문자열로 두면 기본 달 모양 그림이 대신 나옵니다.
