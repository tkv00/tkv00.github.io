/**
 * 티스토리에서 언어 정보 없이 넘어온 코드블록의 언어를 내용으로 판별한다.
 * 확실한 문법을 먼저 검사하고, 로그·수식·디렉터리 구조는 text로 남긴다.
 */
export function detectCodeLanguage(source = '') {
  const code = String(source).replace(/\r\n/g, '\n').trim();
  if (!code) return 'text';

  const lines = code.split('\n');
  const nonEmpty = lines.filter((line) => line.trim());
  const first = nonEmpty[0]?.trim() ?? '';
  const firstDirective = nonEmpty.find((line) => !/^\s*#/.test(line))?.trim() ?? first;

  if (/^\[\s*(?:출력|실행 결과|결과값)/.test(first)) return 'text';

  if (/^(?:graph\s+(?:TD|TB|BT|RL|LR)|flowchart\s+|sequenceDiagram\b|classDiagram\b|stateDiagram)/i.test(first)) {
    return 'mermaid';
  }
  if (/^@start(?:uml|mindmap|wbs|json|yaml)/i.test(first)) return 'plantuml';

  if (/^(?:FROM\s+\S+|ARG\s+\w+|ENTRYPOINT\s+|CMD\s+\[)/.test(firstDirective)
    && /^(?:FROM|RUN|COPY|ADD|WORKDIR|ENV|ARG|EXPOSE|ENTRYPOINT|CMD)\b/im.test(code)) {
    return 'dockerfile';
  }

  if (/^\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/?\S+(?:\s+HTTP\/\d(?:\.\d)?)?/m.test(code)
    || /^\s*HTTP\/\d(?:\.\d)?\s+\d{3}/m.test(code)) return 'http';

  if (/^\s*[\[{]/.test(code)) {
    try {
      JSON.parse(code);
      return 'json';
    } catch {
      if (/^\s*[\[{]\s*\n?\s*["'][^"']+["']\s*:/m.test(code)
        || /"[^"\n]+"\s*:\s*(?:["[{\d]|true\b|false\b|null\b)/.test(code)) return 'json';
    }
  }
  if (/^\s*["'][^"']+["']\s*:\s*\[/m.test(code)) return 'json';

  if (/^\s*<\?xml\b/i.test(code)
    || /^\s*<(?:project|configuration|dependency|dependencies|beans|mapper|svg)\b/i.test(code)) return 'xml';
  if (/^\s*<!doctype\s+html\b/i.test(code)
    || /^\s*<(?:html|head|body|div|section|main|script|template|form|input|button)\b/i.test(code)) return 'html';

  if (/^\s*(?:pipeline|stages|stage|steps|environment|post)\s*\{/m.test(code)
    || /^\s*(?:implementation|testImplementation|runtimeOnly|compileOnly)\s+['"]/m.test(code)
    || /\b(?:Jenkinsfile|buildscript|plugins)\s*\{/.test(code)) return 'groovy';

  const javaSignals = [
    /^\s*@(?:Override|Test|DisplayName|Bean|Entity|Service|Component|Repository|Configuration|Transactional|GetMapping|PostMapping|RestController|Slf4j|Getter|Builder|RequiredArgsConstructor|SpringBootApplication|Cacheable|CacheEvict|Query|Table|ExceptionHandler|Valid|NotNull|Positive)\b/m,
    /\b(?:public|private|protected)\s+(?:(?:static|final|abstract|synchronized)\s+)*(?:class|interface|record|enum|void|[A-Z][\w<>?, ]*)\b/,
    /\b(?:class|interface|record|enum)\s+[A-Z]\w*\b/,
    /\b(?:List|Map|Set|Optional|ResponseEntity|BooleanExpression|String|Long|Integer|BigDecimal|LocalDate|YearMonth)<[^>]+>/,
    /\bnew\s+[A-Z]\w*(?:<[^>]+>)?\s*\(/,
    /\bthrow\s+new\s+[A-Z]\w*\s*\(/,
    /\b(?:extends|implements)\s+[A-Z]\w*/,
    /\.builder\(\)|\.build\(\)|\.orElseThrow\(|\.stream\(\)|\.collect\(/,
    /\bpackage\s+[a-z][\w.]*\s*;/,
    /\bimport\s+(?:static\s+)?[a-z][\w.]*\s*;/,
  ];
  if (javaSignals.some((pattern) => pattern.test(code))) return 'java';
  if (/\b(?:this|super)\.[A-Za-z_]\w*\s*=/.test(code) && /;\s*(?:\n|$)/.test(code)) return 'java';
  if (/\b[A-Z]\w*\.(?:Builder|builder)\.create\(/.test(code)) return 'java';
  if (/^\s*Assumptions\.assumeTrue\(/m.test(code)) return 'java';
  if (/^\s*(?:void|byte|short|int|long|float|double|boolean|char|String|var|[A-Z]\w*(?:<[^>]+>)?)\s+[A-Za-z_]\w*\s*(?:=|;|\()/m.test(code)
    && /[;{}]/.test(code)) return 'java';
  if (/\b(?:when|verify|given)\s*\([^;\n]+\)\.(?:thenReturn|thenThrow|times)\s*\(/.test(code)) return 'java';
  if (/\b(?:Arrays|Collections|Objects|System|Math)\.[A-Za-z_]\w*\s*\(/.test(code) && /;/.test(code)) return 'java';
  if (/\b[A-Za-z_]\w*\.forEach\s*\([^)]*->\s*\{/.test(code) && /;/.test(code)) return 'java';
  if (/^\s*(?:"[^"]*"|[A-Za-z_]\w*)\.[A-Za-z_]\w*\([^;]*\);\s*(?:\/\/.*)?$/m.test(code)) return 'java';
  if (/^\s*\/\*[\s\S]*\*\/\s*$/.test(code)) return 'java';

  if (/^\s*(?:import\s+[\w.]+|from\s+[\w.]+\s+import\s+|def\s+\w+\s*\(|class\s+\w+\s*[:(]|@\w+(?:\([^)]*\))?\s*$)/m.test(code)
    && /(?:\bself\b|:\s*(?:#.*)?$|\bprint\s*\(|\bos\.getenv\b|\bHttpUser\b|\btask\b)/m.test(code)) return 'python';
  if (/^\s*(?:from\s+locust\s+import|import\s+(?:os|sys|time|random|json|requests)\b)/m.test(code)) return 'python';

  if (/^\s*(?:fun\s+\w+|data\s+class\s+|val\s+\w+|var\s+\w+|object\s+\w+|sealed\s+class\s+)/m.test(code)) return 'kotlin';

  const sqlStart = /^(?:EXPLAIN|WITH|SELECT|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|CREATE\s+(?:TABLE|INDEX|CLUSTER|VIEW)|ALTER\s+TABLE|DROP\s+|SHOW\s+|LOCK\s+TABLES|FLUSH\s+TABLES|GRANT\s+|BEGIN\b|COMMIT\b|GET_LOCK\s*\(|RELEASE_LOCK\s*\(|WHERE\b)/i;
  if (sqlStart.test(first.replace(/^\d+[.)]\s*/, ''))
    || /^\s*(?:\w+=>|\w+->|\w+\(>)\s+(?:SELECT|WITH|FROM|JOIN|WHERE|COUNT|AND|OR)\b/im.test(code)
    || /^\s*(?:WHERE|AND|OR)\b/im.test(code) && /\b(?:BETWEEN|LIKE|IN\s*\(|IS\s+(?:NOT\s+)?NULL)|\w+\s*(?:=|<=|>=|<|>)\s*['\w]/i.test(code)
    || /\b(?:SELECT|INSERT\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE)\b[\s\S]*\b(?:FROM|VALUES|ADD|WHERE|INDEX)\b/i.test(code)) {
    return 'sql';
  }

  if (/^\s*(?:name|on|jobs|services|steps|uses|runs-on|spring|server|management|version|volumes|networks):\s*(?:$|\S)/m.test(code)
    || /^\s*-\s+(?:name|uses|run):\s*/m.test(code)
    || /^\s*[\w.-]+:\s*\n(?:\s{2,}[\w.-]+:|\s+-\s+)/m.test(code)) return 'yaml';

  if (/^\s*(?:#!\/|\$\s+|sudo\s+|curl\s+|wget\s+|git\s+|docker(?:-compose)?\s+|kubectl\s+|aws\s+|npm\s+|npx\s+|yarn\s+|pnpm\s+|chmod\s+|mkdir\s+|cd\s+|sysctl\s+|redis-cli\s+|psql\s+|mysql\s+|java\s+-)/m.test(code)
    || /^\s*[A-Za-z_]\w*\(\)\s*\{[\s\S]*\}/m.test(code)
    || /\\\s*\n\s+(?:--?[\w-]+|\|)/.test(code)) return 'bash';

  if (/^\s*(?:[#!]\s*)?(?:spring|server|management|logging|time|jwt|redis|kafka|aws|cloud)\.[\w.-]+\s*[=:]/m.test(code)
    || nonEmpty.filter((line) => /^\s*[A-Z][A-Z0-9_]*=/.test(line)).length >= 2
    || nonEmpty.filter((line) => /^\s*[\w-]+(?:\.[\w-]+)+=/.test(line)).length >= 2) return 'properties';

  if (/^\s*(?:const|let|var)\s+[A-Za-z_$]\w*\s*=|^\s*(?:async\s+)?function\s+\w+\s*\(|=>\s*[{(]?/m.test(code)
    && /[;{}]|\b(?:console|document|window|require|module\.exports)\b/.test(code)) return 'javascript';
  if (/^\s*(?:interface|type|enum)\s+[A-Z]\w*|:\s*(?:string|number|boolean)(?:\[\])?[;,)]/m.test(code)) return 'typescript';

  if (/^\s*(?:\.|#|[a-z][\w-]*)(?:[\s>+~.,:#\[\]="'-]+)?\s*\{[\s\S]*\b(?:color|display|margin|padding|width|height|font|background|border):/im.test(code)) return 'css';

  if (/^\s*#.*\n(?:!?[\w./*-]+\n){2,}/m.test(code)
    && /(?:\.idea|\.gradle|node_modules|gradle-wrapper|\.DS_Store|out\/|build\/)/.test(code)) return 'dockerignore';

  if (nonEmpty.length >= 2 && nonEmpty.every((line) => line.split(',').length >= 3)) return 'csv';

  return 'text';
}
