package com.jobfit.common;

/**
 * 当前请求的用户上下文（Web 登录或设备 token），请求结束时由拦截器清理。
 */
public final class UserContext {

    private static final ThreadLocal<Long> USER_ID = new ThreadLocal<>();
    private static final ThreadLocal<Long> DEVICE_ID = new ThreadLocal<>();

    public static void setUserId(Long userId) {
        USER_ID.set(userId);
    }

    public static void setDeviceId(Long deviceId) {
        DEVICE_ID.set(deviceId);
    }

    public static Long getUserId() {
        Long id = USER_ID.get();
        if (id == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "未登录或登录已失效");
        }
        return id;
    }

    public static Long getDeviceId() {
        return DEVICE_ID.get();
    }

    public static void clear() {
        USER_ID.remove();
        DEVICE_ID.remove();
    }

    private UserContext() {
    }
}
