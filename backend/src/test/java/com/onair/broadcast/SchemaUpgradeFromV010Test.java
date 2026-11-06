package com.onair.broadcast;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

class SchemaUpgradeFromV010Test extends SchemaUpgradeTestBase {

    @DynamicPropertySource
    static void db(DynamicPropertyRegistry registry) {
        스냅샷_DB를_쓴다(registry, "v0.1.0");
    }
}
