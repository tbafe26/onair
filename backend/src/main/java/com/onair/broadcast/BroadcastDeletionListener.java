package com.onair.broadcast;

/** 방송을 지우기 전에 그 방송에 딸린 데이터를 정리하는 쪽이 구현한다. 방송을 지우는 트랜잭션 안에서 불린다. */
public interface BroadcastDeletionListener {

    void beforeDelete(long broadcastId);
}
