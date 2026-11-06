package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.onair.auth.AppUser;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** 소유 방송 찾기의 확인 순서(401, 404, 403)를 Spring 없이 확인한다. */
class OwnedBroadcastsTest {

    final BroadcastRepository repository = mock(BroadcastRepository.class);

    Broadcast ownedBy(long ownerId) {
        AppUser owner = mock(AppUser.class);
        when(owner.getId()).thenReturn(ownerId);
        return new RecordingBroadcast("제목", new Video("k", "v.mp4", VideoFormat.MP4, 1, null, null),
                BroadcastRulesTest.NOW, owner);
    }

    @Test
    void 로그인하지_않았으면_방송을_찾기_전에_401이다() {
        assertThatThrownBy(() -> OwnedBroadcasts.find(repository, 1, null))
                .isInstanceOf(AuthenticationRequiredException.class);
    }

    @Test
    void 방송이_없으면_404다() {
        when(repository.findById(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> OwnedBroadcasts.find(repository, 1, 7L))
                .isInstanceOf(BroadcastNotFoundException.class);
    }

    @Test
    void 소유자가_아니면_403이다() {
        Broadcast broadcast = ownedBy(8);
        when(repository.findById(1L)).thenReturn(Optional.of(broadcast));

        assertThatThrownBy(() -> OwnedBroadcasts.find(repository, 1, 7L))
                .isInstanceOf(BroadcastForbiddenException.class);
    }

    @Test
    void 소유자가_없는_옛_방송은_누구의_것도_아니다() {
        when(repository.findById(1L)).thenReturn(Optional.of(BroadcastRulesTest.recording(null)));

        assertThatThrownBy(() -> OwnedBroadcasts.find(repository, 1, 7L))
                .isInstanceOf(BroadcastForbiddenException.class);
    }

    @Test
    void 소유자이면_방송을_돌려준다() {
        Broadcast broadcast = ownedBy(7);
        when(repository.findById(1L)).thenReturn(Optional.of(broadcast));

        assertThat(OwnedBroadcasts.find(repository, 1, 7L)).isSameAs(broadcast);
    }
}
