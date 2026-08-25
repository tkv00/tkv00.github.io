/**
 * 블로그 설정. 바꿀 일이 있으면 대부분 이 파일 하나만 고치면 된다.
 */
export const site = {
  title: '깃돌',
  latin: 'gitdol',
  description: '부하를 걸어보고, 깨지는 지점을 찾고, 왜 깨졌는지 적어둡니다.',
  url: 'https://tkv00.github.io',
  locale: 'ko_KR',
  since: 2024,
};

export const author = {
  name: '김도연',
  role: 'Backend Engineer',
  bio: '부하를 걸어보고, 깨지는 지점을 찾고, 왜 깨졌는지 적어둡니다.',
  github: 'tkv00',
  email: 'tkv0098@gmail.com',
  // 프로필 사진. public/ 안의 파일을 가리킨다.
  // 비워두면 기본 이미지(달 모양)가 대신 그려진다.
  avatar: '/profile.png',
};

export const nav = [
  { href: '/', label: '홈' },
  { href: '/posts', label: '글 전체' },
  { href: '/tags', label: '태그' },
  { href: '/about', label: '소개' },
];

/** 사이드바 '프로젝트' 순서. 여기 없는 프로젝트는 뒤에 자동으로 붙는다. */
export const projectOrder = [
  'Holliverse', 'Shoot-Pointer', 'WealthTracker', 'Vero', 'Qampus', 'TR1L',
];

/**
 * 댓글 (giscus).
 * 1) 저장소를 public 으로 두고 Settings > General > Features > Discussions 를 켠다
 * 2) https://github.com/apps/giscus 를 저장소에 설치한다
 * 3) https://giscus.app 에서 저장소를 넣고 나오는 값을 아래에 붙여넣는다
 */
export const giscus = {
  enabled: true,
  repo: 'tkv00/tkv00.github.io',
  repoId: 'R_kgDOUD0MCg',
  category: 'General',
  categoryId: 'DIC_kwDOUD0MCs4DEKUT',
  mapping: 'pathname',
  reactionsEnabled: '1',
  lang: 'ko',
};

/**
 * 방문자 수 (GoatCounter — 무료, 광고 없음, 쿠키 없음).
 * https://www.goatcounter.com 에서 가입하고 받은 코드를 넣는다. 예: 'gitdol'
 * 비워두면 방문자 수 표시가 통째로 사라진다.
 */
export const analytics = {
  goatcounter: '',
};

/** 검색엔진 소유확인 코드. 없으면 비워둔다. */
export const verification = {
  google: '',
  naver: '',
};
