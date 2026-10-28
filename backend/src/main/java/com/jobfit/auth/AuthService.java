package com.jobfit.auth;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jobfit.auth.dto.LoginRequest;
import com.jobfit.auth.dto.LoginResponse;
import com.jobfit.auth.dto.RegisterRequest;
import com.jobfit.auth.dto.UserVO;
import com.jobfit.auth.entity.SysUser;
import com.jobfit.auth.mapper.SysUserMapper;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final SysUserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public LoginResponse register(RegisterRequest request) {
        String username = request.getUsername().trim();
        Long count = userMapper.selectCount(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (count != null && count > 0) {
            throw new BizException(ErrorCode.PARAM, "用户名已存在");
        }
        SysUser user = new SysUser();
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setNickname(request.getNickname() == null || request.getNickname().isBlank()
                ? username : request.getNickname().trim());
        user.setEmail(request.getEmail());
        user.setRole("SEEKER");
        userMapper.insert(user);
        return doLogin(user);
    }

    public LoginResponse login(LoginRequest request) {
        SysUser user = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, request.getUsername().trim())
                .last("LIMIT 1"));
        if (user == null || !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BizException(ErrorCode.PARAM, "用户名或密码错误");
        }
        return doLogin(user);
    }

    public UserVO me(Long userId) {
        SysUser user = userMapper.selectById(userId);
        if (user == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "用户不存在");
        }
        return toVO(user);
    }

    public UserVO updateIntention(Long userId, String intention) {
        SysUser user = userMapper.selectById(userId);
        if (user == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "用户不存在");
        }
        user.setJobIntention(intention.trim());
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.updateById(user);
        return toVO(user);
    }

    private LoginResponse doLogin(SysUser user) {
        StpUtil.login(user.getId());
        LoginResponse response = new LoginResponse();
        response.setToken(StpUtil.getTokenValue());
        response.setUser(toVO(user));
        response.setUserId(user.getId());
        response.setUsername(user.getUsername());
        response.setNickname(user.getNickname());
        response.setRole(user.getRole());
        response.setJobIntention(user.getJobIntention());
        return response;
    }

    private UserVO toVO(SysUser user) {
        UserVO vo = new UserVO();
        vo.setId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setNickname(user.getNickname());
        vo.setEmail(user.getEmail());
        vo.setRole(user.getRole());
        vo.setJobIntention(user.getJobIntention());
        vo.setCreatedAt(user.getCreatedAt());
        return vo;
    }
}
