package com.jobfit.job.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.jobfit.job.dto.JobListItem;
import com.jobfit.job.entity.Job;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.util.List;

@Mapper
public interface JobMapper extends BaseMapper<Job> {

    @Select("""
            <script>
            SELECT j.id, j.title, j.company, j.city, j.salary_range, j.exp_req, j.degree_req, j.tags,
                   j.jd_summary, j.job_url, j.source, j.jd_hash, j.status, j.collected_at, j.created_at,
                   (SELECT r.total_score FROM match_report r WHERE r.job_id = j.id
                     ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS latest_score,
                   (CASE WHEN EXISTS (SELECT 1 FROM application a WHERE a.job_id = j.id
                     AND a.user_id = j.user_id AND a.status = 'SENT') THEN 1 ELSE 0 END) AS applied_flag
            FROM job j
            WHERE j.user_id = #{userId} AND j.status = 'ACTIVE'
            <if test="keyword != null and keyword != ''">
              AND (j.title LIKE CONCAT('%', #{keyword}, '%') OR j.company LIKE CONCAT('%', #{keyword}, '%'))
            </if>
            <if test="city != null and city != ''">
              AND j.city = #{city}
            </if>
            <if test="minScore != null">
              AND (SELECT r.total_score FROM match_report r WHERE r.job_id = j.id
                ORDER BY r.created_at DESC, r.id DESC LIMIT 1) &gt;= #{minScore}
            </if>
            <if test="applied != null">
              AND (CASE WHEN EXISTS (SELECT 1 FROM application a WHERE a.job_id = j.id
                AND a.user_id = j.user_id AND a.status = 'SENT') THEN 1 ELSE 0 END) = #{applied}
            </if>
            ORDER BY j.collected_at DESC, j.id DESC
            LIMIT #{size} OFFSET #{offset}
            </script>
            """)
    List<JobListItem> selectListPage(@Param("userId") Long userId,
                                     @Param("keyword") String keyword,
                                     @Param("city") String city,
                                     @Param("minScore") BigDecimal minScore,
                                     @Param("applied") Integer applied,
                                     @Param("offset") int offset,
                                     @Param("size") int size);

    @Select("""
            <script>
            SELECT COUNT(*)
            FROM job j
            WHERE j.user_id = #{userId} AND j.status = 'ACTIVE'
            <if test="keyword != null and keyword != ''">
              AND (j.title LIKE CONCAT('%', #{keyword}, '%') OR j.company LIKE CONCAT('%', #{keyword}, '%'))
            </if>
            <if test="city != null and city != ''">
              AND j.city = #{city}
            </if>
            <if test="minScore != null">
              AND (SELECT r.total_score FROM match_report r WHERE r.job_id = j.id
                ORDER BY r.created_at DESC, r.id DESC LIMIT 1) &gt;= #{minScore}
            </if>
            <if test="applied != null">
              AND (CASE WHEN EXISTS (SELECT 1 FROM application a WHERE a.job_id = j.id
                AND a.user_id = j.user_id AND a.status = 'SENT') THEN 1 ELSE 0 END) = #{applied}
            </if>
            </script>
            """)
    long countListPage(@Param("userId") Long userId,
                       @Param("keyword") String keyword,
                       @Param("city") String city,
                       @Param("minScore") BigDecimal minScore,
                       @Param("applied") Integer applied);
}
