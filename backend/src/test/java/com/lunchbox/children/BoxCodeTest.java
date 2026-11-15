package com.lunchbox.children;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BoxCodeTest {

    @Test
    void isTwoClearLettersThenTwoClearDigits() {
        for (int i = 0; i < 2_000; i++) {
            assertThat(BoxCode.of(UUID.randomUUID())).matches("[A-HJ-NPR-Z]{2}[2-9]{2}");
        }
    }

    @Test
    void isStableForAChild() {
        UUID id = UUID.fromString("0192f3a1-7c2e-7d4b-9a10-3f5e6b7c8d9e");
        assertThat(BoxCode.of(id)).isEqualTo(BoxCode.of(UUID.fromString(id.toString())));
    }

    @Test
    void spreadsNeighbouringIdsAcrossTheCodeSpace() {
        // UUIDv7 ids created in the same millisecond differ only in their low bits; siblings registered together
        // must still get different marks.
        Set<String> codes = new HashSet<>();
        long high = 0x0192F3A17C2E7D4BL;
        for (long low = 0; low < 200; low++) {
            codes.add(BoxCode.of(new UUID(high, 0x9A10000000000000L + low)));
        }
        assertThat(codes.size()).isGreaterThan(190);
    }

    @Test
    void nullIdHasNoCode() {
        assertThat(BoxCode.of(null)).isNull();
    }
}
