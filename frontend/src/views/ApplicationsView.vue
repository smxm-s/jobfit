<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import type { Application } from '@/types'

const router = useRouter()

const applications = ref<Application[]>([])
const loading = ref(true)
const error = ref('')
const status = ref<'ALL' | Application['status']>('ALL')

const FILTERS: { value: 'ALL' | Application['status']; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'SENT', label: '已投' },
  { value: 'SKIPPED', label: '跳过' },
  { value: 'FAILED', label: '失败' }
]

const STATUS_TEXT: Record<Application['status'], string> = {
  SENT: '已投',
  SKIPPED: '跳过',
  FAILED: '失败'
}

const STATUS_TONE: Record<Application['status'], string> = {
  SENT: 'ok',
  SKIPPED: '',
  FAILED: 'bad'
}

const SKIP_REASONS: Record<string, string> = {
  LOW_SCORE: '分数低于阈值',
  EXCLUDED: '命中排除词',
  DUPLICATE: '该岗位已投递',
  NO_GREETING: '未配置打招呼语'
}

const FAIL_REASONS: Record<string, string> = {
  CAPTCHA: '触发验证码',
  RISK_PAGE: '命中风控页',
  SELECTOR_MISS: '页面结构变化'
}

const filtered = computed(() =>
  status.value === 'ALL'
    ? applications.value
    : applications.value.filter((item) => item.status === status.value)
)

const counts = computed(() => ({
  sent: applications.value.filter((item) => item.status === 'SENT').length,
  skipped: applications.value.filter((item) => item.status === 'SKIPPED').length,
  failed: applications.value.filter((item) => item.status === 'FAILED').length
}))

function reasonOf(item: Application): string {
  if (item.status === 'FAILED') {
    return (item.failReason && FAIL_REASONS[item.failReason]) || item.failReason || '—'
  }
  if (item.status === 'SKIPPED') {
    return (item.skipReason && SKIP_REASONS[item.skipReason]) || item.skipReason || '—'
  }
  return '—'
}

function statusText(status: string): string {
  return STATUS_TEXT[status as Application['status']] ?? status
}

function statusTone(status: string): string {
  return STATUS_TONE[status as Application['status']] ?? ''
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    applications.value = await api.listApplications()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '投递记录加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>投递记录</h1>
        <p class="sub">
          共 {{ applications.length }} 条 · 已投 {{ counts.sent }} · 跳过 {{ counts.skipped }} ·
          失败 {{ counts.failed }}
        </p>
      </div>
      <div class="top-actions">
        <button class="btn" type="button" @click="router.push('/agent')">投递设置</button>
      </div>
    </div>

    <div class="card">
      <div class="card-h">
        <div class="seg">
          <button
            v-for="item in FILTERS"
            :key="item.value"
            type="button"
            :class="{ on: status === item.value }"
            @click="status = item.value"
          >
            {{ item.label }}
          </button>
        </div>
        <span class="tiny muted">同一岗位不会重复投递</span>
      </div>

      <div v-if="loading" class="loading-text">正在加载投递记录…</div>
      <div v-else-if="error" class="empty">
        {{ error }}
        <div style="margin-top: 12px">
          <button class="btn" type="button" @click="load">重试</button>
        </div>
      </div>
      <el-table v-else :data="filtered" style="width: 100%">
        <el-table-column label="岗位 / 公司" min-width="220">
          <template #default="{ row }">
            <div class="jobtitle">{{ row.jobTitle }}</div>
            <div class="jobsub">{{ row.company }}</div>
          </template>
        </el-table-column>
        <el-table-column label="城市" width="80">
          <template #default="{ row }">
            <span class="muted">{{ row.city }}</span>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="70">
          <template #default="{ row }">
            <span class="mono">{{ row.applyLevel }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span class="tag" :class="statusTone(row.status)">
              {{ statusText(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="失败 / 跳过原因" min-width="160">
          <template #default="{ row }">
            <span :class="row.status === 'FAILED' ? 'muted' : 'muted tiny'">
              {{ reasonOf(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">
            <span class="muted tiny">{{ row.appliedAt }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="100">
          <template #default="{ row }">
            <span class="mono">{{ row.channel }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty">还没有投递记录，先去已采集岗位挑选</div>
        </template>
      </el-table>
    </div>
  </div>
</template>
