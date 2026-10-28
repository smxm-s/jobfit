package com.jobfit.match;

import com.jobfit.common.PageResult;
import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import com.jobfit.match.dto.ReportDetailVO;
import com.jobfit.match.dto.ReportListItem;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final MatchService matchService;

    @GetMapping("/{id}")
    public Result<ReportDetailVO> detail(@PathVariable Long id) {
        return Result.ok(matchService.reportDetail(UserContext.getUserId(), id));
    }

    @GetMapping
    public Result<PageResult<ReportListItem>> list(@RequestParam(defaultValue = "1") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return Result.ok(matchService.listReports(UserContext.getUserId(), page, size));
    }
}
