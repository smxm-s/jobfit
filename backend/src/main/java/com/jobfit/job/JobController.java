package com.jobfit.job;

import com.jobfit.common.PageResult;
import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import com.jobfit.job.dto.IngestRequest;
import com.jobfit.job.dto.IngestResponse;
import com.jobfit.job.dto.JobDetailVO;
import com.jobfit.job.dto.JobListItem;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class JobController {

    private final JobService jobService;

    @PostMapping("/jobs/ingest")
    public Result<IngestResponse> ingest(@RequestBody IngestRequest request) {
        return Result.ok(jobService.ingest(UserContext.getUserId(), request));
    }

    @GetMapping("/jobs")
    public Result<PageResult<JobListItem>> list(@RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int size,
                                                @RequestParam(required = false) String keyword,
                                                @RequestParam(required = false) String city,
                                                @RequestParam(required = false) BigDecimal minScore,
                                                @RequestParam(required = false) Boolean applied) {
        return Result.ok(jobService.list(UserContext.getUserId(), page, size, keyword, city, minScore, applied));
    }

    @GetMapping("/jobs/{id}")
    public Result<JobDetailVO> detail(@PathVariable Long id) {
        return Result.ok(jobService.detail(UserContext.getUserId(), id));
    }
}
