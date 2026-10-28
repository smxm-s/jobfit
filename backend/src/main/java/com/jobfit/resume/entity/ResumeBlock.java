package com.jobfit.resume.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

@Data
@TableName("resume_block")
public class ResumeBlock {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long versionId;

    private String blockType;

    private Integer sectionIdx;

    private String rawText;

    private Integer pageNo;

    private Integer startOffset;

    private Integer endOffset;

    private BigDecimal confidence;

    private Integer corrected;

    @TableField(select = false)
    private byte[] embedding;
}
