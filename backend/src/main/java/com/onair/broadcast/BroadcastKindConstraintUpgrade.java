package com.onair.broadcast;

import java.util.Arrays;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 이전 버전이 만든 DB에서 지금의 방송 종류를 막는 kind 검사 제약을 지운다.
 * Hibernate는 구분 컬럼에 그때의 종류만 허용하는 검사 제약을 만들고, ddl-auto=update는 이 제약을 고치지 않는다.
 * 그래서 녹화방송만 있던 v0.1.0의 DB에는 라이브방송을 저장할 수 없다.
 *
 * <p>새 제약을 다시 걸지 않는다. H2는 ALTER TABLE로 추가한 검사 제약을 만든 연결이 닫히면 그 제약의 평가에 실패한다.
 * kind는 애플리케이션이 엔티티 종류로 정해 넣는 값이다.
 */
@Component
class BroadcastKindConstraintUpgrade implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    BroadcastKindConstraintUpgrade(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        upgrade();
    }

    void upgrade() {
        List<String> kinds = Arrays.stream(BroadcastKind.values()).map(Enum::name).toList();
        List<KindCheck> checks = jdbc.query("""
                select cc.constraint_name, cc.check_clause
                from information_schema.check_constraints cc
                join information_schema.constraint_column_usage ccu
                  on ccu.constraint_schema = cc.constraint_schema
                 and ccu.constraint_name = cc.constraint_name
                where ccu.table_schema = current_schema
                  and ccu.table_name = 'BROADCAST'
                  and ccu.column_name = 'KIND'""",
                (rs, row) -> new KindCheck(rs.getString(1), rs.getString(2)));

        for (KindCheck check : checks) {
            if (!check.allows(kinds)) {
                jdbc.execute("alter table broadcast drop constraint \"" + check.name() + "\"");
            }
        }
    }

    private record KindCheck(String name, String clause) {
        boolean allows(List<String> kinds) {
            return kinds.stream().allMatch(kind -> clause.contains("'" + kind + "'"));
        }
    }
}
