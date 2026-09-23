출처: [dnd-side-project/dnd-15th-2-backend](https://github.com/dnd-side-project/dnd-15th-2-backend/tree/b7118f7628813bed86a15f9eb5b46063b4400a1d/src/main/resources/db/migration), 커밋 `b7118f7628813bed86a15f9eb5b46063b4400a1d`.

범위: `src/main/resources/db/migration/*.sql`의 V1~V28. `src/integrationTest/resources/db/failure`의 테스트용 SQL 2개는 합계에서 제외했습니다.

| 파일 | 데이터 |
| --- | --- |
| `sql-lines` | 파일 수와 SQL·주석·빈 줄 구성 |
| `migration-length` | 줄 수가 많은 마이그레이션 8개 |
| `ddl-declarations` | CREATE/ALTER 선언 수 |
| `table-declarations` | 버전별 CREATE TABLE 선언 누적 |

각 그래프는 PNG와 SVG로 제공합니다. 줄 수는 파일의 실제 줄 수입니다. SQL 줄은 빈 줄과 `--`로 시작하는 주석 줄을 제외했습니다. 선언 수는 줄 시작 키워드를 센 값이며, 데이터베이스 적용 이력이 아닙니다.

재생성: `node scripts/generate-qello-sql-visuals.mjs`
