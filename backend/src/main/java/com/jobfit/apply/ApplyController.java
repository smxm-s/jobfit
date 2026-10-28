package com.jobfit.apply;

import com.jobfit.apply.dto.ApplicationReportRequest;
import com.jobfit.apply.dto.ApplyReportResult;
import com.jobfit.apply.entity.Application;
import com.jobfit.common.PageResult;
import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/applications")
@RequiredArgsConstructor
public class ApplyController {

    private final ApplyService applyService;

    @PostMapping("/report")
    public Result<ApplyReportResult> report(@RequestBody ApplicationReportRequest request) {
        return Result.ok(applyService.report(UserContext.getUserId(), request));
    }

    @GetMapping
    public Result<PageResult<Application>> list(@RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        return Result.ok(applyService.list(UserContext.getUserId(), page, size));
    }
}
