package com.onair.broadcast;

import com.onair.auth.AuthenticatedUser;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 댓글 요청을 댓글 모듈에 넘기는 adapter. 로그인 여부와 권한은 모듈이 판단한다. */
@RestController
@RequestMapping("/api/broadcasts/{id}/comments")
class CommentController {

    private final Comments comments;

    CommentController(Comments comments) {
        this.comments = comments;
    }

    @GetMapping
    CommentPage list(
            @PathVariable long id,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size) {
        return comments.list(id, before, size);
    }

    @PostMapping
    ResponseEntity<CommentView> write(
            @PathVariable long id,
            @RequestBody(required = false) CommentRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        CommentView created = comments.write(
                id, AuthenticatedUser.idOf(user), request == null ? null : request.content());
        return ResponseEntity.created(URI.create("/api/broadcasts/" + id + "/comments")).body(created);
    }

    @DeleteMapping("/{commentId}")
    ResponseEntity<Void> delete(
            @PathVariable long id, @PathVariable long commentId, @AuthenticationPrincipal AuthenticatedUser user) {
        comments.delete(id, commentId, AuthenticatedUser.idOf(user));
        return ResponseEntity.noContent().build();
    }

    record CommentRequest(String content) {
    }
}
