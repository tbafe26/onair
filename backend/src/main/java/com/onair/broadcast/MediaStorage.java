package com.onair.broadcast;

import java.io.InputStream;
import java.util.Optional;
import org.springframework.core.io.Resource;

/** 영상과 썸네일 파일 저장소. 지금은 로컬 폴더 구현뿐이고, 나중에 외부 저장소로 바꿔 끼울 수 있다. */
public interface MediaStorage {

    /** 등록 한 번에 저장하는 파일 묶음을 연다. */
    Batch begin();

    /** 키로 읽기용 리소스를 연다. 파일이 없으면 비어 있다. */
    Optional<Resource> open(String key);

    /** 키의 파일을 지운다. 이미 없으면 아무것도 하지 않고, 지우지 못하면 UncheckedIOException이다. */
    void delete(String key);

    /**
     * 파일 묶음. commit하지 않고 close하면 묶음에서 저장한 파일을 모두 지운다.
     * try-with-resources로 쓰면 도중에 실패해도 파일이 남지 않는다.
     */
    interface Batch extends AutoCloseable {

        /** 스트림을 읽으며 바로 저장하고, 서버가 만든 키를 돌려준다. 파일을 메모리에 통째로 올리지 않는다. */
        String store(InputStream content);

        /** 저장한 파일을 확정한다. 이후 close는 아무것도 지우지 않는다. */
        void commit();

        /** 확정하지 않았다면 묶음의 파일을 모두 지운다. 하나가 지워지지 않아도 나머지는 계속 지운다. */
        @Override
        void close();
    }
}
