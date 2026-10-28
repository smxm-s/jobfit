package com.jobfit.agent;

import com.jobfit.agent.dto.AgentConfigDTO;
import com.jobfit.agent.dto.BootstrapVO;
import com.jobfit.agent.dto.DeviceVO;
import com.jobfit.agent.dto.PairCodeVO;
import com.jobfit.agent.dto.PairRequest;
import com.jobfit.agent.dto.PairResult;
import com.jobfit.common.Result;
import com.jobfit.common.UserContext;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentController {

    private final AgentService agentService;
    private final AgentDeviceService deviceService;

    @GetMapping("/config")
    public Result<AgentConfigDTO> getConfig() {
        return Result.ok(agentService.getConfig(UserContext.getUserId()));
    }

    @PutMapping("/config")
    public Result<AgentConfigDTO> saveConfig(@RequestBody AgentConfigDTO request) {
        return Result.ok(agentService.saveConfig(UserContext.getUserId(), request));
    }

    @PostMapping("/pair-code")
    public Result<PairCodeVO> pairCode() {
        return Result.ok(agentService.createPairCode(UserContext.getUserId()));
    }

    @PostMapping("/pair")
    public Result<PairResult> pair(@Valid @RequestBody PairRequest request) {
        return Result.ok(agentService.pair(request));
    }

    @GetMapping("/devices")
    public Result<List<DeviceVO>> devices() {
        return Result.ok(agentService.devices(UserContext.getUserId()));
    }

    @DeleteMapping("/devices/{id}")
    public Result<Void> revoke(@PathVariable Long id) {
        agentService.revokeDevice(UserContext.getUserId(), id);
        return Result.ok();
    }

    @GetMapping("/bootstrap")
    public Result<BootstrapVO> bootstrap() {
        return Result.ok(agentService.bootstrap(UserContext.getUserId()));
    }

    @PostMapping("/heartbeat")
    public Result<Map<String, Object>> heartbeat() {
        deviceService.touch(UserContext.getDeviceId());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("serverTime", LocalDateTime.now());
        return Result.ok(data);
    }
}
