package com.jobfit.resume;

import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import com.jobfit.resume.dto.ResumeCreateRequest;
import com.jobfit.resume.dto.ResumeVO;
import com.jobfit.resume.dto.ResumeVersionVO;
import com.jobfit.resume.dto.UploadResult;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/resumes")
@RequiredArgsConstructor
public class ResumeController {

    private final ResumeService resumeService;

    @PostMapping
    public Result<ResumeVO> create(@Valid @RequestBody ResumeCreateRequest request) {
        return Result.ok(resumeService.create(UserContext.getUserId(), request.getTitle()));
    }

    @GetMapping
    public Result<List<ResumeVO>> list() {
        return Result.ok(resumeService.list(UserContext.getUserId()));
    }

    @PostMapping("/{id}/upload")
    public Result<UploadResult> upload(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return Result.ok(resumeService.upload(UserContext.getUserId(), id, file));
    }

    @GetMapping("/{id}/versions/latest")
    public Result<ResumeVersionVO> latestVersion(@PathVariable Long id) {
        return Result.ok(resumeService.latestVersion(UserContext.getUserId(), id));
    }
}
