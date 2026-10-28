<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import ChipInput from '@/components/ChipInput.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { AgentConfig, AgentDevice, ApplyLevel, PairCode } from '@/types'

const workspace = useWorkspaceStore()

const config = ref<AgentConfig | null>(null)
const devices = ref<AgentDevice[]>([])
const pairCode = ref<PairCode | null>(null)
const loading = ref(true)
const saving = ref(false)
const generating = ref(false)
const error = ref('')

const stats = computed(() => workspace.dashboard?.stats ?? null)
const activeDevices = computed(() => devices.value.filter((device) => !device.revoked))

const quotaRate = computed(() => {
  if (!stats.value || !stats.value.dailyLimit) return 0
  return Math.round((stats.value.appliedToday / stats.value.dailyLimit) * 100)
})

const LEVELS: { value: ApplyLevel; label: string }[] = [
  { value: 'L1', label: 'L1 只标注' },
  { value: 'L2', label: 'L2 一键确认' },
  { value: 'L3', label: 'L3 自动队列' }
]

const LEVEL_HINTS: Record<ApplyLevel, string> = {
  L1: '只在岗位卡片上显示分数，不做任何操作，零账号风险。',
  L2: '打开详情页并预填打招呼语，由你点击发送。默认推荐。',
  L3: '队列自动发送，限频 40–120 秒/条、日上限 30；遇验证码立即熔断。默认关闭。'
}

const expOptions = ['应届', '1年以内', '1-3年', '3-5年', '5年以上']
const degreeOptions = ['大专', '本科', '硕士', '博士']

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [cfg, deviceList, code] = await Promise.all([
      api.getAgentConfig(),
      api.listDevices(),
      api.createPairCode().catch(() => null)
    ])
    config.value = cfg
    devices.value = deviceList
    pairCode.value = code
  } catch (err) {
    error.value = err instanceof Error ? err.message : '筛选配置加载失败'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!config.value) return
  saving.value = true
  try {
    config.value = await api.saveAgentConfig(config.value)
    ElMessage.success('配置已保存，插件下次启动生效')
    await workspace.load(true)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

async function reset(): Promise<void> {
  try {
    config.value = await api.getAgentConfig()
    ElMessage.success('已恢复上次配置')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '恢复失败')
  }
}

async function generateCode(): Promise<void> {
  generating.value = true
  try {
    pairCode.value = await api.createPairCode()
    ElMessage.success('已生成新的配对码，10 分钟内有效')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '生成配对码失败')
  } finally {
    generating.value = false
  }
}

async function copyCode(): Promise<void> {
  if (!pairCode.value) return
  try {
    await navigator.clipboard.writeText(pairCode.value.code)
    ElMessage.success('已复制配对码')
  } catch {
    ElMessage.warning('复制失败，请手动选择配对码')
  }
}

async function revoke(device: AgentDevice): Promise<void> {
  try {
    await api.revokeDevice(device.id)
    devices.value = await api.listDevices()
    ElMessage.success(`已解绑 ${device.deviceName}`)
    await workspace.load(true)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '解绑失败')
  }
}

function setLevel(level: ApplyLevel): void {
  if (!config.value) return
  config.value.applyLevel = level
  if (level === 'L3') {
    ElMessage.warning('L3 为实验特性，默认关闭，开启后请留意账号风控')
  }
}

onMounted(() => {
  void load()
  void workspace.load()
})
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>岗位筛选</h1>
        <p class="sub">保存后插件按此配置打开 Boss 列表页，自动采集与打分</p>
      </div>
      <div class="top-actions">
        <button class="btn" type="button" :disabled="!config" @click="reset">重置</button>
        <button class="btn btn-primary" :disabled="saving || !config" type="button" @click="save">
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-text">正在加载筛选配置…</div>
    <div v-else-if="error" class="card">
      <div class="empty">
        {{ error }}
        <div style="margin-top: 12px">
          <button class="btn" type="button" @click="load">重试</button>
        </div>
      </div>
    </div>

    <div v-else-if="config" class="grid g-2-1">
      <div class="card">
        <div class="card-h">
          <div class="card-t">搜索条件</div>
          <span class="tiny muted">城市/薪资/经验/学历由 Boss 原生筛选承担</span>
        </div>
        <div class="card-b">
          <div class="field">
            <label>城市</label>
            <ChipInput v-model="config.cities" add-label="添加城市" placeholder="如：杭州" />
          </div>

          <div class="field">
            <label>关键词</label>
            <el-input v-model="config.keyword" placeholder="如：Java 后端" />
          </div>

          <div class="field">
            <label>薪资范围（K/月）</label>
            <div class="row">
              <el-input-number
                v-model="config.salaryMin"
                :min="0"
                :max="200"
                :controls="false"
                style="width: 96px"
              />
              <span class="muted">—</span>
              <el-input-number
                v-model="config.salaryMax"
                :min="0"
                :max="300"
                :controls="false"
                style="width: 96px"
              />
            </div>
          </div>
          <div class="field">
            <label>经验 / 学历</label>
            <div class="split">
              <el-select
                v-model="config.expCodes"
                multiple
                collapse-tags
                placeholder="经验"
                style="width: 100%"
              >
                <el-option v-for="item in expOptions" :key="item" :label="item" :value="item" />
              </el-select>
              <el-select
                v-model="config.degreeCodes"
                multiple
                collapse-tags
                placeholder="学历"
                style="width: 100%"
              >
                <el-option
                  v-for="item in degreeOptions"
                  :key="item"
                  :label="item"
                  :value="item"
                />
              </el-select>
            </div>
          </div>

          <div class="field">
            <label>排除词（只在我们这边过滤，不下发给 Boss）</label>
            <ChipInput v-model="config.excludeWords" add-label="添加" placeholder="如：外包" />
            <div class="hint">命中标题、公司名或摘要任一即丢弃，不进入打分。</div>
          </div>

          <div class="field">
            <label>
              分数阈值
              <b style="color: var(--accent)">{{ config.scoreThreshold.toFixed(2) }}</b>
            </label>
            <el-slider
              v-model="config.scoreThreshold"
              :min="0.4"
              :max="0.95"
              :step="0.05"
              :show-tooltip="false"
            />
            <div class="hint">低于阈值的岗位在插件里折叠，只有达标岗位进入投递队列。</div>
          </div>

          <div class="field">
            <label>投递等级</label>
            <div class="seg">
              <button
                v-for="level in LEVELS"
                :key="level.value"
                type="button"
                :class="{ on: config.applyLevel === level.value }"
                @click="setLevel(level.value)"
              >
                {{ level.label }}
              </button>
            </div>
            <div class="hint">{{ LEVEL_HINTS[config.applyLevel] }}</div>
            <div v-if="config.applyLevel === 'L3'" class="warnbox" style="margin-top: 8px">
              L3 为实验特性，默认关闭：限频 40–120 秒/条、日上限与时段限制，遇验证码或风控页立即熔断，不重试。
            </div>
          </div>

          <div class="split">
            <div class="field">
              <label>每日投递上限</label>
              <el-input-number
                v-model="config.dailyLimit"
                :min="1"
                :max="80"
                :controls="false"
                style="width: 100%"
              />
            </div>
            <div class="field">
              <label>投递时段</label>
              <el-input v-model="config.activeHours" placeholder="09:00-21:00" />
            </div>
          </div>

          <div class="field">
            <label>打招呼语模板</label>
            <el-input v-model="config.greetingTemplate" type="textarea" :rows="3" />
            <div class="hint">
              支持 {job}、{company} 占位符；L3 会自动填充，L2 由你确认后发送。
            </div>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-h">
            <div class="card-t">插件配对</div>
            <span class="tag ok">{{ activeDevices.length }} 台设备</span>
          </div>
          <div class="card-b">
            <div class="tiny muted" style="margin-bottom: 8px">
              在插件里输入配对码，有效期 10 分钟
            </div>
            <div
              class="mono"
              style="
                font-size: 22px;
                letter-spacing: 3px;
                font-weight: 600;
                background: #f7f8fa;
                border: 1px dashed var(--line);
                border-radius: 8px;
                padding: 12px;
                text-align: center;
              "
            >
              {{ pairCode?.code || '——' }}
            </div>
            <div class="row between" style="margin-top: 10px">
              <span class="tiny muted">Cookie 只留在本机，不上传</span>
              <div class="row" style="gap: 6px">
                <button class="btn btn-sm" type="button" @click="generateCode">
                  {{ generating ? '生成中…' : '重新生成' }}
                </button>
                <button class="btn btn-sm" type="button" @click="copyCode">复制</button>
              </div>
            </div>

            <div style="border-top: 1px solid var(--line-2); margin: 14px 0 10px"></div>

            <div v-for="device in activeDevices" :key="device.id" class="kv">
              <span>{{ device.deviceName }} · {{ device.lastSeenAt }}</span>
              <button class="link-btn" type="button" @click="revoke(device)">解绑</button>
            </div>
            <div v-if="!activeDevices.length" class="empty small">还没有配对设备</div>
          </div>
        </div>

        <div class="card">
          <div class="card-h">
            <div class="card-t">执行概览</div>
            <span class="tiny muted">阈值 {{ stats?.threshold.toFixed(2) ?? '—' }}</span>
          </div>
          <div class="card-b">
            <div class="kv"><span>本周采集</span><b>{{ stats?.weeklyCollected ?? '—' }} 条</b></div>
            <div class="kv"><span>达标岗位</span><b>{{ stats?.qualified ?? '—' }} 条</b></div>
            <div class="kv"><span>已投递</span><b>{{ stats?.applied ?? '—' }} 次</b></div>
            <div class="kv">
              <span>今日已投</span>
              <b>{{ stats?.appliedToday ?? '—' }} / {{ config.dailyLimit }} 次</b>
            </div>
            <div class="bar" style="margin-top: 12px">
              <i :style="{ width: quotaRate + '%' }"></i>
            </div>
            <div class="tiny muted" style="margin-top: 6px">
              今日剩余额度 {{ stats?.remainingQuota ?? '—' }} 次
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
