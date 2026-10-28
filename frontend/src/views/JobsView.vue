<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api'
import ScoreBar from '@/components/ScoreBar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { AgentConfig, Job, JobStatus } from '@/types'

const router = useRouter()
const workspace = useWorkspaceStore()

const jobs = ref<Job[]>([])
const config = ref<AgentConfig | null>(null)
const loading = ref(true)
const error = ref('')
const keyword = ref('')
const status = ref<JobStatus | ''>('')
const total = ref(0)

const FILTERS: { value: JobStatus | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待投' },
  { value: 'APPLIED', label: '已投' },
  { value: 'SKIPPED', label: '跳过' }
]

const threshold = computed(() => config.value?.scoreThreshold ?? 0.7)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return jobs.value
    .filter((job) => {
      if (status.value && job.status !== status.value) return false
      if (!kw) return true
      return [job.title, job.company, ...job.hitSkills].some((value) =>
        value.toLowerCase().includes(kw)
      )
    })
    .sort((a, b) => b.score - a.score)
})

const totalCount = computed(
  () => workspace.dashboard?.stats.totalJobs ?? Math.max(total.value, jobs.value.length)
)
const qualifiedCount = computed(
  () =>
    workspace.dashboard?.stats.qualified ??
    jobs.value.filter((job) => job.score >= threshold.value).length
)

function statusView(job: Job): { text: string; tone: string } {
  if (job.status === 'APPLIED') return { text: '已投', tone: 'ok' }
  if (job.status === 'SKIPPED') return { text: '已跳过', tone: '' }
  if (job.score < threshold.value) return { text: '低于阈值', tone: 'warn' }
  return { text: '待投', tone: 'accent' }
}

function rowClass({ row }: { row: Job }): string {
  return row.score < threshold.value ? 'row-below' : ''
}

async function openReport(job: Job): Promise<void> {
  if (job.reportId) {
    void router.push(`/reports/${job.reportId}`)
    return
  }
  if (!config.value?.resumeVersionId) {
    ElMessage.warning('请先在「简历」上传并确认一个版本，再对岗位做精算')
    return
  }
  try {
    const result = await api.matchJob(job.id, config.value.resumeVersionId)
    job.reportId = result.reportId
    void router.push(`/reports/${result.reportId}`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '精算失败，请稍后重试')
  }
}

function massApply(): void {
  ElMessage.success('已按分数加入投递队列（演示）')
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [page, cfg] = await Promise.all([
      api.listJobs({ page: 1, size: 200 }),
      api.getAgentConfig()
    ])
    jobs.value = page.list
    total.value = page.total
    config.value = cfg
  } catch (err) {
    error.value = err instanceof Error ? err.message : '岗位列表加载失败'
  } finally {
    loading.value = false
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
        <h1>已采集岗位</h1>
        <p class="sub">
          共 {{ totalCount }} 条，当前阈值
          <b>{{ threshold.toFixed(2) }}</b> 下 {{ qualifiedCount }} 条达标
        </p>
      </div>
      <div class="top-actions">
        <button class="btn" type="button" @click="router.push('/agent')">调整筛选</button>
        <button class="btn btn-primary" type="button" @click="massApply">按分数投递</button>
      </div>
    </div>

    <div class="card">
      <div class="card-h">
        <div class="row" style="gap: 8px; flex: 1">
          <el-input
            v-model="keyword"
            placeholder="搜索岗位 / 公司 / 技能"
            clearable
            style="max-width: 260px"
          />
          <div class="seg">
            <button
              v-for="item in FILTERS"
              :key="item.label"
              type="button"
              :class="{ on: status === item.value }"
              @click="status = item.value"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <span class="tiny muted">按分数降序</span>
      </div>

      <div v-if="loading" class="loading-text">正在加载已采集岗位…</div>
      <div v-else-if="error" class="empty">
        {{ error }}
        <div style="margin-top: 12px">
          <button class="btn" type="button" @click="load">重试</button>
        </div>
      </div>
      <el-table
        v-else
        :data="filtered"
        style="width: 100%"
        :row-class-name="rowClass"
        @row-click="openReport"
      >
        <el-table-column label="岗位 / 公司" min-width="190">
          <template #default="{ row }">
            <div class="jobtitle">{{ row.title }}</div>
            <div class="jobsub">
              {{ row.company }} ·
              {{ row.hitSkills.slice(0, 2).join(' / ') || '无技能命中' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="城市" width="64">
          <template #default="{ row }">
            <span class="muted">{{ row.city }}</span>
          </template>
        </el-table-column>
        <el-table-column label="薪资" width="88">
          <template #default="{ row }">{{ row.salary }}</template>
        </el-table-column>
        <el-table-column label="经验 · 学历" width="104">
          <template #default="{ row }">
            <span class="muted">{{ row.exp }} · {{ row.degree }}</span>
          </template>
        </el-table-column>
        <el-table-column label="匹配分" width="120">
          <template #default="{ row }">
            <ScoreBar :score="row.score" thin />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="84">
          <template #default="{ row }">
            <span class="tag" :class="statusView(row).tone">{{ statusView(row).text }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="56" align="right">
          <template #default="{ row }">
            <span class="muted tiny" @click.stop="openReport(row)">查看 →</span>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty">没有匹配的岗位，试试调整筛选或搜索词</div>
        </template>
      </el-table>
    </div>
  </div>
</template>
