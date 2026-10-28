<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import type { RecentReport } from '@/types'

const router = useRouter()
const workspace = useWorkspaceStore()

const dashboard = computed(() => workspace.dashboard)
const stats = computed(() => dashboard.value?.stats ?? null)
const plugin = computed(() => dashboard.value?.plugin ?? null)
const recentReports = computed(() => dashboard.value?.recentReports ?? [])
const capability = computed(() => dashboard.value?.capability ?? [])

const qualifiedRate = computed(() => {
  if (!stats.value || !stats.value.weeklyCollected) return 0
  return Math.round((stats.value.qualified / stats.value.weeklyCollected) * 100)
})

const quotaRate = computed(() => {
  if (!plugin.value || !plugin.value.quotaTotal) return 0
  return Math.round((plugin.value.quotaUsed / plugin.value.quotaTotal) * 100)
})

const LEVEL_TEXT: Record<string, string> = {
  L1: 'L1 只标注',
  L2: 'L2 一键确认',
  L3: 'L3 自动队列'
}

function levelText(level?: string): string {
  return (level && LEVEL_TEXT[level]) || '—'
}

function tone(score: number): string {
  return score >= 0.75 ? 's-hi' : score >= 0.6 ? 's-mid' : 's-low'
}

function openReport(row: RecentReport): void {
  void router.push(`/reports/${row.reportId}`)
}

onMounted(() => {
  void workspace.load()
})
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>工作台</h1>
        <p class="sub">
          <template v-if="stats">
            本周采集 {{ stats.weeklyCollected }} 条岗位，{{ stats.qualified }} 条高分岗位待处理
          </template>
          <template v-else>正在加载求职数据…</template>
        </p>
      </div>
      <div class="top-actions">
        <button class="btn" type="button" @click="router.push('/agent')">筛选配置</button>
        <button class="btn btn-primary" type="button" @click="router.push('/jobs')">
          查看岗位
        </button>
      </div>
    </div>

    <div v-if="workspace.loading && !dashboard" class="loading-text">正在加载工作台数据…</div>

    <div v-else-if="workspace.error && !dashboard" class="card">
      <div class="empty">
        {{ workspace.error }}
        <div style="margin-top: 12px">
          <button class="btn" type="button" @click="workspace.load(true)">重试</button>
        </div>
      </div>
    </div>

    <template v-else-if="dashboard && stats">
      <div class="grid g4" style="margin-bottom: 14px">
        <div class="card stat">
          <div class="k">简历版本</div>
          <div class="v">{{ stats.resumeVersions }} <small>版</small></div>
          <div class="d">
            最新 v{{ stats.resumeVersions }} · 解析置信度
            {{ stats.parseConfidence.toFixed(2) }}
          </div>
        </div>
        <div class="card stat">
          <div class="k">本周采集</div>
          <div class="v">{{ stats.weeklyCollected }} <small>条</small></div>
          <div class="d">
            <span class="trend">+{{ stats.weeklyTrend }}%</span> 较上周
          </div>
        </div>
        <div class="card stat">
          <div class="k">达标岗位</div>
          <div class="v">{{ stats.qualified }} <small>条</small></div>
          <div class="d">阈值 {{ stats.threshold.toFixed(2) }}，占采集量 {{ qualifiedRate }}%</div>
        </div>
        <div class="card stat">
          <div class="k">已投递</div>
          <div class="v">{{ stats.applied }} <small>次</small></div>
          <div class="d">今日 {{ stats.appliedToday }} 次 · 剩余额度 {{ stats.remainingQuota }}</div>
        </div>
      </div>

      <div class="grid g-2-1">
        <div class="card">
          <div class="card-h">
            <div class="card-t">最近诊断</div>
            <button class="btn btn-ghost btn-sm" type="button" @click="router.push('/jobs')">
              全部
            </button>
          </div>
          <el-table
            :data="recentReports"
            style="width: 100%"
            @row-click="openReport"
          >
            <el-table-column label="岗位" min-width="150">
              <template #default="{ row }">
                <div class="jobtitle">{{ row.title }}</div>
                <div class="jobsub">{{ row.company }}</div>
              </template>
            </el-table-column>
            <el-table-column label="城市" width="56">
              <template #default="{ row }">
                <span class="muted">{{ row.city }}</span>
              </template>
            </el-table-column>
            <el-table-column label="总分" width="64">
              <template #default="{ row }">
                <b :class="tone(row.score)">{{ row.score.toFixed(2) }}</b>
              </template>
            </el-table-column>
            <el-table-column label="最大短板" min-width="88">
              <template #default="{ row }">
                <span class="muted">{{ row.topGap }}</span>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="62">
              <template #default="{ row }">
                <span class="muted tiny">{{ row.createdAt }}</span>
              </template>
            </el-table-column>
            <template #empty>
              <div class="empty">还没有诊断记录，先去岗位页精算一个岗位</div>
            </template>
          </el-table>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-h">
              <div class="card-t">插件状态</div>
              <span class="tag" :class="plugin?.connected ? 'ok' : 'warn'">
                {{ plugin?.connected ? '已连接' : '未连接' }}
              </span>
            </div>
            <div class="card-b">
              <div class="kv"><span>设备</span><b>{{ plugin?.device || '—' }}</b></div>
              <div class="kv">
                <span>今日剩余额度</span>
                <b>{{ stats.remainingQuota }} / {{ stats.dailyLimit }}</b>
              </div>
              <div class="kv"><span>投递等级</span><b>{{ levelText(plugin?.applyLevel) }}</b></div>
              <div class="kv"><span>队列</span><b>{{ plugin?.queueState || '—' }}</b></div>
              <div class="bar" style="margin-top: 12px">
                <i :style="{ width: quotaRate + '%' }"></i>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-h">
              <div class="card-t">能力画像</div>
              <span class="tiny muted">来自 v{{ stats.resumeVersions }}</span>
            </div>
            <div v-if="capability.length" class="card-b" style="display: grid; gap: 11px">
              <div v-for="item in capability" :key="item.label">
                <div class="row between tiny" style="margin-bottom: 4px">
                  <span>{{ item.label }}</span>
                  <b>{{ item.score.toFixed(2) }}</b>
                </div>
                <div class="bar thin">
                  <i
                    :style="{
                      width: item.score * 100 + '%',
                      background: item.score < 0.55 ? '#c9a227' : 'var(--accent)'
                    }"
                  ></i>
                </div>
              </div>
            </div>
            <div v-else class="empty small">暂无能力画像数据</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
