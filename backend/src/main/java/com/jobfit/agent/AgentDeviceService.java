package com.jobfit.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.jobfit.agent.dto.DeviceVO;
import com.jobfit.agent.dto.PairResult;
import com.jobfit.agent.entity.AgentDevice;
import com.jobfit.agent.mapper.AgentDeviceMapper;
import com.jobfit.common.BizException;
import com.jobfit.common.ErrorCode;
import com.jobfit.common.HashUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AgentDeviceService {

    private final AgentDeviceMapper deviceMapper;
    private final SecureRandom random = new SecureRandom();

    public AgentDevice requireByToken(String token) {
        AgentDevice device = deviceMapper.selectOne(new LambdaQueryWrapper<AgentDevice>()
                .eq(AgentDevice::getTokenHash, HashUtil.sha256Hex(token))
                .eq(AgentDevice::getRevoked, 0)
                .last("LIMIT 1"));
        if (device == null) {
            throw new BizException(ErrorCode.DEVICE_INVALID, "设备 token 无效或已撤销");
        }
        return device;
    }

    /**
     * 生成设备 token，明文只在此处返回一次，库中只存 sha256。
     */
    public PairResult create(Long userId, String deviceName) {
        byte[] raw = new byte[24];
        random.nextBytes(raw);
        String token = "agt_" + HexFormat.of().formatHex(raw);

        AgentDevice device = new AgentDevice();
        device.setUserId(userId);
        device.setDeviceName(deviceName == null || deviceName.isBlank() ? "未知设备" : deviceName.trim());
        device.setTokenHash(HashUtil.sha256Hex(token));
        device.setRevoked(0);
        device.setLastSeenAt(LocalDateTime.now());
        deviceMapper.insert(device);

        return new PairResult(token, userId, device.getId());
    }

    public List<DeviceVO> list(Long userId) {
        List<AgentDevice> devices = deviceMapper.selectList(new LambdaQueryWrapper<AgentDevice>()
                .eq(AgentDevice::getUserId, userId)
                .orderByDesc(AgentDevice::getCreatedAt)
                .orderByDesc(AgentDevice::getId));
        return devices.stream().map(this::toVO).toList();
    }

    public void revoke(Long userId, Long deviceId) {
        AgentDevice device = deviceMapper.selectById(deviceId);
        if (device == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "设备不存在");
        }
        if (!userId.equals(device.getUserId())) {
            throw new BizException(ErrorCode.NOT_OWNED, "无权操作该设备");
        }
        device.setRevoked(1);
        deviceMapper.updateById(device);
    }

    public void touch(Long deviceId) {
        if (deviceId == null) {
            return;
        }
        AgentDevice device = new AgentDevice();
        device.setId(deviceId);
        device.setLastSeenAt(LocalDateTime.now());
        deviceMapper.updateById(device);
    }

    private DeviceVO toVO(AgentDevice device) {
        DeviceVO vo = new DeviceVO();
        vo.setId(device.getId());
        vo.setDeviceName(device.getDeviceName());
        vo.setLastSeenAt(device.getLastSeenAt());
        vo.setRevoked(device.getRevoked());
        vo.setCreatedAt(device.getCreatedAt());
        return vo;
    }
}
