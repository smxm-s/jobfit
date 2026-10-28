package com.jobfit.resume;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import com.jobfit.common.HashUtil;
import com.jobfit.config.AlgoClient;
import com.jobfit.resume.dto.AlgoBlock;
import com.jobfit.resume.dto.BlockVO;
import com.jobfit.resume.dto.ResumeVO;
import com.jobfit.resume.dto.ResumeVersionVO;
import com.jobfit.resume.dto.TaskVO;
import com.jobfit.resume.dto.UploadResult;
import com.jobfit.resume.entity.ParseTask;
import com.jobfit.resume.entity.Resume;
import com.jobfit.resume.entity.ResumeBlock;
import com.jobfit.resume.entity.ResumeVersion;
import com.jobfit.resume.mapper.ParseTaskMapper;
import com.jobfit.resume.mapper.ResumeBlockMapper;
import com.jobfit.resume.mapper.ResumeMapper;
import com.jobfit.resume.mapper.ResumeVersionMapper;
import com.jobfit.storage.MinioStorage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class ResumeService {

    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    private static final Set<String> ALLOWED_EXT = Set.of("pdf", "docx");

    private final ResumeMapper resumeMapper;
    private final ResumeVersionMapper versionMapper;
    private final ResumeBlockMapper blockMapper;
    private final ParseTaskMapper taskMapper;
    private final MinioStorage minioStorage;
    private final AlgoClient algoClient;
    private final ObjectMapper objectMapper;

    public ResumeVO create(Long userId, String title) {
        Resume resume = new Resume();
        resume.setUserId(userId);
        resume.setTitle(title.trim());
        resume.setCurrentVersion(0);
        resume.setStatus("DRAFT");
        resumeMapper.insert(resume);
        return toVO(resumeMapper.selectById(resume.getId()));
    }

    public List<ResumeVO> list(Long userId) {
        List<Resume> resumes = resumeMapper.selectList(new LambdaQueryWrapper<Resume>()
                .eq(Resume::getUserId, userId)
                .orderByDesc(Resume::getCreatedAt)
                .orderByDesc(Resume::getId));
        return resumes.stream().map(this::toVO).toList();
    }

    public Resume requireOwned(Long userId, Long resumeId) {
        Resume resume = resumeMapper.selectById(resumeId);
        if (resume == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "简历不存在");
        }
        if (!userId.equals(resume.getUserId())) {
            throw new BizException(ErrorCode.NOT_OWNED, "无权访问该简历");
        }
        return resume;
    }

    public ResumeVersion requireVersionOwned(Long userId, Long versionId) {
        ResumeVersion version = versionMapper.selectById(versionId);
        if (version == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "简历版本不存在");
        }
        Resume resume = resumeMapper.selectById(version.getResumeId());
        if (resume == null || !userId.equals(resume.getUserId())) {
            throw new BizException(ErrorCode.NOT_OWNED, "无权访问该简历版本");
        }
        return version;
    }

    /**
     * 上传简历：校验格式与大小 → sha256 去重 → 落 parse_task → 调算法解析 → 写版本与区块。
     */
    public UploadResult upload(Long userId, Long resumeId, MultipartFile file) {
        Resume resume = requireOwned(userId, resumeId);
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.PARAM, "文件不能为空");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BizException(ErrorCode.FILE_SIZE, "文件超过 10MB 限制");
        }
        String fileName = file.getOriginalFilename() == null ? "resume" : file.getOriginalFilename();
        int dot = fileName.lastIndexOf('.');
        String ext = dot < 0 ? "" : fileName.substring(dot + 1).toLowerCase();
        if (!ALLOWED_EXT.contains(ext)) {
            throw new BizException(ErrorCode.FILE_TYPE, "仅支持 PDF / DOCX 文件");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BizException(ErrorCode.INTERNAL, "读取文件失败");
        }
        String hash = HashUtil.sha256Hex(bytes);

        boolean dedup = false;
        String fileKey = findExistingFileKey(userId, hash);
        if (fileKey != null) {
            dedup = true;
        } else {
            String objectName = "resume/" + userId + "/" + hash + "." + ext;
            String stored = minioStorage.uploadResume(objectName, bytes, contentType(ext));
            fileKey = stored != null ? stored : "local/" + hash + "." + ext;
        }

        resume.setFileHash(hash);
        resume.setUpdatedAt(LocalDateTime.now());
        resumeMapper.updateById(resume);

        ParseTask task = new ParseTask();
        task.setResumeId(resumeId);
        task.setFileKey(fileKey);
        task.setFileName(fileName);
        task.setStatus("PENDING");
        task.setAttempts(0);
        taskMapper.insert(task);

        task.setStatus("RUNNING");
        task.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(task);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fileKey", fileKey);
        body.put("docType", ext.toUpperCase());

        JsonNode response;
        try {
            response = algoClient.post("/internal/parse", body);
        } catch (BizException e) {
            markFailed(task, e.getMessage());
            throw new BizException(ErrorCode.PARSE_FAILED, "简历解析失败，算法服务不可用");
        }

        try {
            saveParsedResult(resume, response);
            task.setStatus("SUCCESS");
            task.setUpdatedAt(LocalDateTime.now());
            taskMapper.updateById(task);
        } catch (BizException e) {
            markFailed(task, e.getMessage());
            throw e;
        } catch (Exception e) {
            log.error("保存解析结果失败, resumeId={}", resumeId, e);
            markFailed(task, "保存解析结果失败");
            throw new BizException(ErrorCode.PARSE_FAILED, "解析失败，请稍后重试");
        }
        return new UploadResult(task.getId(), dedup);
    }

    public TaskVO getTask(Long userId, Long taskId) {
        ParseTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "任务不存在");
        }
        requireOwned(userId, task.getResumeId());
        TaskVO vo = new TaskVO();
        vo.setId(task.getId());
        vo.setResumeId(task.getResumeId());
        vo.setFileName(task.getFileName());
        vo.setStatus(task.getStatus());
        vo.setErrorMsg(task.getErrorMsg());
        vo.setAttempts(task.getAttempts());
        vo.setCreatedAt(task.getCreatedAt());
        vo.setUpdatedAt(task.getUpdatedAt());
        if ("SUCCESS".equals(task.getStatus())) {
            ResumeVersion latest = latestVersionOrNull(task.getResumeId());
            vo.setVersionId(latest == null ? null : latest.getId());
        }
        return vo;
    }

    public ResumeVersionVO latestVersion(Long userId, Long resumeId) {
        requireOwned(userId, resumeId);
        ResumeVersion version = latestVersionOrNull(resumeId);
        if (version == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "简历尚未生成版本");
        }
        ResumeVersionVO vo = new ResumeVersionVO();
        vo.setVersionId(version.getId());
        vo.setResumeId(version.getResumeId());
        vo.setVersionNo(version.getVersionNo());
        vo.setSource(version.getSource());
        vo.setParseConfidence(version.getParseConfidence());
        vo.setCreatedAt(version.getCreatedAt());
        try {
            vo.setSchema(objectMapper.readTree(version.getSchemaJson()));
        } catch (Exception e) {
            throw new BizException(ErrorCode.INTERNAL, "简历结构数据异常");
        }
        vo.setBlocks(blocksOf(version.getId()));
        return vo;
    }

    public List<BlockVO> blocksOf(Long versionId) {
        List<ResumeBlock> blocks = blockMapper.selectList(new LambdaQueryWrapper<ResumeBlock>()
                .eq(ResumeBlock::getVersionId, versionId)
                .orderByAsc(ResumeBlock::getId));
        return blocks.stream().map(this::toBlockVO).toList();
    }

    public ResumeVersion latestVersionOrNull(Long resumeId) {
        return versionMapper.selectOne(new LambdaQueryWrapper<ResumeVersion>()
                .eq(ResumeVersion::getResumeId, resumeId)
                .orderByDesc(ResumeVersion::getVersionNo)
                .last("LIMIT 1"));
    }

    private void saveParsedResult(Resume resume, JsonNode response) throws Exception {
        JsonNode schemaNode = response.get("schema");
        if (schemaNode != null && schemaNode.isTextual()) {
            schemaNode = objectMapper.readTree(schemaNode.asText());
        }
        if (schemaNode == null || !schemaNode.isObject()) {
            throw new BizException(ErrorCode.PARSE_FAILED, "算法服务未返回结构化简历");
        }

        int nextVersion = (resume.getCurrentVersion() == null ? 0 : resume.getCurrentVersion()) + 1;
        ResumeVersion version = new ResumeVersion();
        version.setResumeId(resume.getId());
        version.setVersionNo(nextVersion);
        version.setSchemaJson(objectMapper.writeValueAsString(schemaNode));
        version.setSource("UPLOAD");
        JsonNode confidenceNode = response.get("confidence");
        if (confidenceNode != null && confidenceNode.isNumber()) {
            version.setParseConfidence(confidenceNode.decimalValue());
        }
        version.setCreatedAt(LocalDateTime.now());
        versionMapper.insert(version);

        List<AlgoBlock> algoBlocks = parseBlocks(response.get("blocks"));
        for (AlgoBlock algoBlock : algoBlocks) {
            ResumeBlock block = new ResumeBlock();
            block.setVersionId(version.getId());
            block.setBlockType(algoBlock.getBlockType() == null ? "OTHER" : algoBlock.getBlockType());
            block.setSectionIdx(algoBlock.getSectionIdx() == null ? 0 : algoBlock.getSectionIdx());
            block.setRawText(algoBlock.getRawText());
            block.setPageNo(algoBlock.getPageNo());
            block.setStartOffset(algoBlock.getStartOffset());
            block.setEndOffset(algoBlock.getEndOffset());
            block.setConfidence(algoBlock.getConfidence());
            block.setCorrected(0);
            blockMapper.insert(block);
        }

        resume.setCurrentVersion(nextVersion);
        resume.setStatus("PARSED");
        resume.setUpdatedAt(LocalDateTime.now());
        resumeMapper.updateById(resume);
    }

    private List<AlgoBlock> parseBlocks(JsonNode blocksNode) {
        List<AlgoBlock> result = new ArrayList<>();
        if (blocksNode == null || !blocksNode.isArray()) {
            return result;
        }
        for (JsonNode node : blocksNode) {
            String rawText = text(node, "rawText", "raw_text");
            if (rawText == null || rawText.isBlank()) {
                continue;
            }
            AlgoBlock block = new AlgoBlock();
            block.setBlockType(text(node, "blockType", "block_type"));
            block.setSectionIdx(integer(node, "sectionIdx", "section_idx"));
            block.setRawText(rawText);
            block.setPageNo(integer(node, "pageNo", "page_no"));
            block.setStartOffset(integer(node, "startOffset", "start_offset"));
            block.setEndOffset(integer(node, "endOffset", "end_offset"));
            JsonNode confidence = node.hasNonNull("confidence") ? node.get("confidence") : null;
            if (confidence != null && confidence.isNumber()) {
                block.setConfidence(confidence.decimalValue());
            }
            result.add(block);
        }
        return result;
    }

    private String text(JsonNode node, String camel, String snake) {
        JsonNode value = node.hasNonNull(camel) ? node.get(camel) : node.get(snake);
        return value == null || value.isNull() ? null : value.asText();
    }

    private Integer integer(JsonNode node, String camel, String snake) {
        JsonNode value = node.hasNonNull(camel) ? node.get(camel) : node.get(snake);
        return value == null || value.isNull() || !value.isNumber() ? null : value.asInt();
    }

    private String findExistingFileKey(Long userId, String hash) {
        List<Resume> sameHash = resumeMapper.selectList(new LambdaQueryWrapper<Resume>()
                .eq(Resume::getUserId, userId)
                .eq(Resume::getFileHash, hash));
        for (Resume resume : sameHash) {
            ParseTask task = taskMapper.selectOne(new LambdaQueryWrapper<ParseTask>()
                    .eq(ParseTask::getResumeId, resume.getId())
                    .orderByDesc(ParseTask::getId)
                    .last("LIMIT 1"));
            if (task != null) {
                return task.getFileKey();
            }
        }
        return null;
    }

    private void markFailed(ParseTask task, String message) {
        task.setStatus("FAILED");
        task.setErrorMsg(truncate(message, 500));
        task.setAttempts((task.getAttempts() == null ? 0 : task.getAttempts()) + 1);
        task.setUpdatedAt(LocalDateTime.now());
        taskMapper.updateById(task);
    }

    private String truncate(String text, int max) {
        if (text == null) {
            return "未知错误";
        }
        return text.length() <= max ? text : text.substring(0, max);
    }

    private String contentType(String ext) {
        return "pdf".equals(ext)
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    private ResumeVO toVO(Resume resume) {
        ResumeVO vo = new ResumeVO();
        vo.setId(resume.getId());
        vo.setTitle(resume.getTitle());
        vo.setCurrentVersion(resume.getCurrentVersion());
        vo.setStatus(resume.getStatus());
        vo.setFileHash(resume.getFileHash());
        vo.setCreatedAt(resume.getCreatedAt());
        vo.setUpdatedAt(resume.getUpdatedAt());
        return vo;
    }

    private BlockVO toBlockVO(ResumeBlock block) {
        BlockVO vo = new BlockVO();
        vo.setId(block.getId());
        vo.setBlockType(block.getBlockType());
        vo.setSectionIdx(block.getSectionIdx());
        vo.setRawText(block.getRawText());
        vo.setPageNo(block.getPageNo());
        vo.setStartOffset(block.getStartOffset());
        vo.setEndOffset(block.getEndOffset());
        vo.setConfidence(block.getConfidence());
        vo.setCorrected(block.getCorrected());
        return vo;
    }
}
