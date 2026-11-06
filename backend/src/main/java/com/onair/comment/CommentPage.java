package com.onair.comment;

import java.util.List;

/** 댓글 한 묶음(최신순). nextCursor가 있으면 이 값을 before로 넘겨 다음 묶음을 받고, 없으면 마지막이다. */
record CommentPage(List<CommentView> items, Long nextCursor, long totalCount) {
}
