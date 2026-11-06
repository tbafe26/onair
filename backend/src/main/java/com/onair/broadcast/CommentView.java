package com.onair.broadcast;

import java.time.Instant;

/** 댓글 하나의 JSON 모양. */
record CommentView(Long id, String content, CommentAuthor author, Instant createdAt) {

    /** 댓글 작성자의 공개 정보. */
    record CommentAuthor(long id, String nickname) {
    }

    static CommentView of(Comment comment) {
        return new CommentView(comment.getId(), comment.getContent(),
                new CommentAuthor(comment.getAuthor().getId(), comment.getAuthor().getNickname()),
                comment.getCreatedAt());
    }
}
