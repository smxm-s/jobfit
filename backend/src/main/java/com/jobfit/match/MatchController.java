package com.jobfit.match;

import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import com.jobfit.match.dto.BatchMatchItem;
import com.jobfit.match.dto.MatchBatchRequest;
import com.jobfit.match.dto.MatchRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class MatchController {

    private final MatchService matchService;

    @PostMapping("/jobs/{id}/match")
    public Result<Map<String, Long>> match(@PathVariable Long id, @Valid @RequestBody MatchRequest request) {
        Long reportId = matchService.match(UserContext.getUserId(), id, request.getVersionId());
        return Result.ok(Map.of("reportId", reportId));
    }

    @PostMapping("/match/batch")
    public Result<List<BatchMatchItem>> batch(@Valid @RequestBody MatchBatchRequest request) {
        return Result.ok(matchService.batch(UserContext.getUserId(), request));
    }
}
