package com.jobfit.match.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.jobfit.match.dto.ReportListItem;
import com.jobfit.match.entity.MatchReport;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface MatchReportMapper extends BaseMapper<MatchReport> {

    @Select("""
            SELECT r.id, r.job_id, r.total_score, r.algo_version, r.created_at,
                   j.title AS job_title, j.company AS company
            FROM match_report r
            JOIN job j ON j.id = r.job_id
            WHERE j.user_id = #{userId}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<ReportListItem> selectPage(@Param("userId") Long userId,
                                    @Param("offset") int offset,
                                    @Param("size") int size);

    @Select("""
            SELECT COUNT(*)
            FROM match_report r
            JOIN job j ON j.id = r.job_id
            WHERE j.user_id = #{userId}
            """)
    long countPage(@Param("userId") Long userId);
}
