package com.jobfit.auth;

import com.jobfit.auth.dto.IntentionRequest;
import com.jobfit.auth.dto.UserVO;
import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class MeController {

    private final AuthService authService;

    @GetMapping
    public Result<UserVO> me() {
        return Result.ok(authService.me(UserContext.getUserId()));
    }

    @PutMapping("/intention")
    public Result<UserVO> updateIntention(@Valid @RequestBody IntentionRequest request) {
        return Result.ok(authService.updateIntention(UserContext.getUserId(), request.getIntention()));
    }
}
