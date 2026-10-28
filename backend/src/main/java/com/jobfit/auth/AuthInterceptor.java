package com.jobfit.auth;

import com.jobfit.agent.AgentDeviceService;
import com.jobfit.agent.entity.AgentDevice;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import com.jobfit.common.UserContext;
import cn.dev33.satoken.stp.StpUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Set;

/**
 * Web 端走 Sa-Token（Authorization: Bearer <token>）；
 * 插件端在指定路径上用 X-Agent-Token 设备 token 鉴权。
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private static final Set<String> DEVICE_PATHS = Set.of(
            "/api/jobs/ingest",
            "/api/match/batch",
            "/api/applications/report",
            "/api/agent/bootstrap",
            "/api/agent/heartbeat"
    );

    private final AgentDeviceService deviceService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        String agentToken = request.getHeader("X-Agent-Token");
        if (DEVICE_PATHS.contains(path) && agentToken != null && !agentToken.isBlank()) {
            AgentDevice device = deviceService.requireByToken(agentToken);
            UserContext.setUserId(device.getUserId());
            UserContext.setDeviceId(device.getId());
            return true;
        }
        if (StpUtil.isLogin()) {
            UserContext.setUserId(StpUtil.getLoginIdAsLong());
            return true;
        }
        throw new BizException(ErrorCode.UNAUTHORIZED, "未登录或登录已失效");
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }
}
