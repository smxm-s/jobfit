package com.jobfit.resume;

import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import com.jobfit.resume.dto.TaskVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final ResumeService resumeService;

    @GetMapping("/{taskId}")
    public Result<TaskVO> get(@PathVariable Long taskId) {
        return Result.ok(resumeService.getTask(UserContext.getUserId(), taskId));
    }
}
