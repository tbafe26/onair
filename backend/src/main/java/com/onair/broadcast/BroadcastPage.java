package com.onair.broadcast;

import java.util.List;

/** 방송 목록 한 묶음. hasNext가 참이면 마지막 id를 before로 넘겨 다음 묶음을 받는다. */
record BroadcastPage(List<BroadcastSummary> items, boolean hasNext) {
}
