package com.jobfit.apply.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.jobfit.apply.entity.Application;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ApplicationMapper extends BaseMapper<Application> {
}
