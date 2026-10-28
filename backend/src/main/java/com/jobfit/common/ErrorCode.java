package com.jobfit.common;

/**
 * 业务错误码，口径见 PROJECT.md 9.6。
 */
public final class ErrorCode {

    public static final int OK = 0;
    public static final int PARAM = 1001;
    public static final int UNAUTHORIZED = 1002;
    public static final int FORBIDDEN = 1003;
    public static final int FILE_TYPE = 2001;
    public static final int FILE_SIZE = 2002;
    public static final int PARSE_FAILED = 2003;
    public static final int NOT_FOUND = 3001;
    public static final int NOT_OWNED = 3002;
    public static final int ALGO_UNAVAILABLE = 4001;
    public static final int INTERNAL = 5000;
    public static final int PAIR_CODE_INVALID = 6001;
    public static final int DEVICE_INVALID = 6002;

    private ErrorCode() {
    }
}
